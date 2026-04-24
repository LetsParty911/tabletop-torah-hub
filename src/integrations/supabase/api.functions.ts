import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin, getSupabaseForUser } from "@/integrations/supabase/client.server";
import { toParshaComparableKey } from "@/lib/parsha-normalize";
import { hebcalToParshaKey, hebcalYomTovToKey } from "@/lib/parshiyos";

// Resolve the currently-featured parsha (key + Hebrew year) the same way the
// homepage does: settings override first, otherwise Hebcal. Used to exclude
// the live week from the archive.
async function resolveCurrentFeatured(): Promise<{
  comparableKey: string | null;
  jewishYear: number | null;
}> {
  let parshaKey: string | null = null;
  let jewishYear: number | null = null;

  try {
    const admin = getSupabaseAdmin();
    const { data: s } = await admin
      .from("settings")
      .select("parsha_override")
      .eq("id", 1)
      .maybeSingle();
    if (s?.parsha_override) parshaKey = s.parsha_override;
  } catch {
    // ignore
  }

  try {
    const res = await fetch(
      "https://www.hebcal.com/shabbat?cfg=json&geonameid=5128581&M=on",
    );
    const data = (await res.json()) as {
      items?: Array<{ title: string; category: string; subcat?: string; date: string; hdate?: string }>;
    };
    const items = data?.items ?? [];
    const parsha = items.find((i) => i.category === "parashat");
    const yomTovOnShabbos = parsha
      ? items.find(
          (i) =>
            i.category === "holiday" &&
            i.subcat === "major" &&
            i.date.slice(0, 10) === parsha.date.slice(0, 10),
        )
      : undefined;

    if (!parshaKey) {
      if (yomTovOnShabbos) {
        parshaKey = hebcalYomTovToKey(yomTovOnShabbos.title) ?? yomTovOnShabbos.title;
      } else if (parsha) {
        parshaKey = hebcalToParshaKey(parsha.title);
      }
    }

    // Derive Hebrew year from the parsha's hdate (e.g. "26th of Nisan, 5786")
    const hdate = parsha?.hdate ?? items.find((i) => i.hdate)?.hdate;
    if (hdate) {
      const m = hdate.match(/(\d{4,5})\s*$/);
      if (m) jewishYear = Number(m[1]);
    }
  } catch {
    // ignore
  }

  // Fallback Hebrew year: Gregorian + 3760, bump after Sept 15
  if (!jewishYear) {
    const d = new Date();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    jewishYear =
      d.getUTCFullYear() + 3760 + (month > 9 || (month === 9 && day >= 15) ? 1 : 0);
  }

  return {
    comparableKey: parshaKey ? toParshaComparableKey(parshaKey) : null,
    jewishYear,
  };
}

// ---------- Public: list published PDFs for a parsha key ----------
// Filters by canonical comparable key so spelling variants between the
// homepage's resolved parsha and the stored admin parsha_key always match.
export const listPublishedPdfs = createServerFn({ method: "GET" })
  .inputValidator((input: { parshaKey: string }) =>
    z.object({ parshaKey: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const target = toParshaComparableKey(data.parshaKey);
    const { data: rows, error } = await admin
      .from("pdfs")
      .select("id, title, subtitle, file_path, parsha_key")
      .eq("published", true)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("listPublishedPdfs error", error);
      return { resources: [] as Array<{ id: string; title: string; subtitle: string | null; url: string }> };
    }
    const matched = (rows ?? []).filter(
      (r) => toParshaComparableKey(r.parsha_key) === target,
    );
    const resources = await Promise.all(
      matched.map(async (r) => {
        const { data: signed } = await admin.storage
          .from("pdfs")
          .createSignedUrl(r.file_path, 60 * 60);
        return {
          id: r.id,
          title: r.title,
          subtitle: r.subtitle,
          url: signed?.signedUrl ?? "#",
        };
      }),
    );
    return { resources };
  });

// ---------- Public: archive — all published PDFs grouped by year + parsha ----------
export type ArchivePdf = { id: string; title: string; subtitle: string | null };
export type ArchiveParsha = { parshaKey: string; pdfs: ArchivePdf[] };
export type ArchiveYear = { year: number; parshiyos: ArchiveParsha[] };
export type ArchiveResult = { years: ArchiveYear[] };

export const listArchive = createServerFn({ method: "GET" }).handler(
  async (): Promise<ArchiveResult> => {
    const admin = getSupabaseAdmin();
    const { data: rows, error } = await admin
      .from("pdfs")
      .select("id, title, subtitle, parsha_key, jewish_year, created_at")
      .eq("published", true)
      .order("jewish_year", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      console.error("listArchive error", error);
      return { years: [] };
    }
    const current = await resolveCurrentFeatured();
    const yearMap = new Map<
      number,
      Map<string, Array<ArchivePdf & { created_at: string }>>
    >();
    for (const r of rows ?? []) {
      const year = (r.jewish_year ?? 0) as number;
      if (!year) continue;
      // Exclude the currently-featured live week (same parsha + same Hebrew year).
      if (
        current.comparableKey &&
        current.jewishYear === year &&
        toParshaComparableKey(r.parsha_key) === current.comparableKey
      ) {
        continue;
      }
      if (!yearMap.has(year)) yearMap.set(year, new Map());
      const pmap = yearMap.get(year)!;
      if (!pmap.has(r.parsha_key)) pmap.set(r.parsha_key, []);
      pmap.get(r.parsha_key)!.push({
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        created_at: r.created_at,
      });
    }
    const years: ArchiveYear[] = Array.from(yearMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, pmap]) => ({
        year,
        parshiyos: Array.from(pmap.entries())
          .map(([parshaKey, pdfs]) => {
            const latest = pdfs.reduce(
              (m, p) => (p.created_at > m ? p.created_at : m),
              pdfs[0].created_at,
            );
            return {
              parshaKey,
              latest,
              pdfs: pdfs.map(({ id, title, subtitle }) => ({ id, title, subtitle })),
            };
          })
          .sort((a, b) => (a.latest < b.latest ? 1 : -1))
          .map(({ parshaKey, pdfs }) => ({ parshaKey, pdfs })),
      }));
    return { years };
  },
);

// ---------- Public: get a single PDF (signed URL + title) by id ----------
export const getPdfById = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const { data: row, error } = await admin
      .from("pdfs")
      .select("id, title, subtitle, file_path, published")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row || !row.published) {
      return { pdf: null as null | { id: string; title: string; subtitle: string | null; url: string } };
    }
    const { data: signed } = await admin.storage
      .from("pdfs")
      .createSignedUrl(row.file_path, 60 * 60);
    return {
      pdf: {
        id: row.id,
        title: row.title,
        subtitle: row.subtitle,
        url: signed?.signedUrl ?? "",
      },
    };
  });

// ---------- Public: read parsha override ----------
export const getParshaOverride = createServerFn({ method: "GET" }).handler(async () => {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("settings")
    .select("parsha_override")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("getParshaOverride error", error);
    return { override: null as string | null };
  }
  return { override: (data?.parsha_override ?? null) as string | null };
});

// ---------- Public: subscribe email ----------
export const subscribeEmail = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) =>
    z.object({ email: z.string().email().max(254) }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("subscribers")
      .insert({ email: data.email.toLowerCase() });
    if (error && !error.message.includes("duplicate")) {
      console.error("subscribeEmail error", error);
      return { ok: false, error: "Could not subscribe. Please try again." };
    }
    return { ok: true, error: null };
  });

// ---------- Public: contact form submission ----------
export const submitContactMessage = createServerFn({ method: "POST" })
  .inputValidator((input: { name?: string; email: string; message: string }) =>
    z
      .object({
        name: z.string().trim().max(120).optional(),
        email: z.string().trim().email().max(254),
        message: z.string().trim().min(1, "Message is required").max(5000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("contact_messages").insert({
      name: data.name && data.name.length > 0 ? data.name : null,
      email: data.email.toLowerCase(),
      message: data.message,
    });
    if (error) {
      console.error("submitContactMessage error", error);
      return { ok: false, error: "Could not send your message. Please try again." };
    }
    return { ok: true, error: null };
  });

// ---------- Helper: verify user is admin from access token ----------
async function requireAdmin(accessToken: string | null) {
  if (!accessToken) throw new Error("Not authenticated");
  const supa = getSupabaseForUser(accessToken);
  const { data: userData, error: uErr } = await supa.auth.getUser();
  if (uErr || !userData?.user) throw new Error("Not authenticated");
  const admin = getSupabaseAdmin();
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  if (!isAdmin) throw new Error("Forbidden");
  return { userId: userData.user.id };
}

// ---------- Admin: check role ----------
export const checkIsAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      await requireAdmin(data.accessToken);
      return { isAdmin: true };
    } catch {
      return { isAdmin: false };
    }
  });

// ---------- Admin: list ALL pdfs ----------
export const adminListPdfs = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { data: rows, error } = await admin
      .from("pdfs")
      .select("id, parsha_key, title, subtitle, file_path, published, jewish_year, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { pdfs: rows ?? [] };
  });

// ---------- Admin: upload PDF (base64) + insert row ----------
export const adminUploadPdf = createServerFn({ method: "POST" })
  .inputValidator((input: {
    accessToken: string;
    parshaKey: string;
    title: string;
    subtitle: string | null;
    published: boolean;
    fileName: string;
    fileBase64: string;
    jewishYear: number;
  }) =>
    z
      .object({
        accessToken: z.string().min(10),
        parshaKey: z.string().min(1).max(120),
        title: z.string().min(1).max(300),
        subtitle: z.string().max(500).nullable(),
        published: z.boolean(),
        fileName: z.string().min(1).max(255),
        fileBase64: z.string().min(10),
        jewishYear: z.number().int().min(5000).max(7000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { userId } = await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${data.parshaKey.replace(/[^a-zA-Z0-9._-]/g, "_")}/${Date.now()}_${safeName}`;
    const buf = Buffer.from(data.fileBase64, "base64");
    const { error: upErr } = await admin.storage
      .from("pdfs")
      .upload(path, buf, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    const { error: insErr } = await admin.from("pdfs").insert({
      parsha_key: data.parshaKey,
      title: data.title,
      subtitle: data.subtitle,
      file_path: path,
      published: data.published,
      jewish_year: data.jewishYear,
      created_by: userId,
    });
    if (insErr) {
      await admin.storage.from("pdfs").remove([path]);
      throw new Error(`DB insert failed: ${insErr.message}`);
    }
    return { ok: true };
  });

// ---------- Admin: toggle published ----------
export const adminTogglePublished = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; id: string; published: boolean }) =>
    z
      .object({
        accessToken: z.string().min(10),
        id: z.string().uuid(),
        published: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("pdfs").update({ published: data.published }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: delete pdf ----------
export const adminDeletePdf = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string().min(10), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { data: row } = await admin.from("pdfs").select("file_path").eq("id", data.id).maybeSingle();
    if (row?.file_path) {
      await admin.storage.from("pdfs").remove([row.file_path]);
    }
    const { error } = await admin.from("pdfs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: set parsha override ----------
export const adminSetParshaOverride = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; override: string | null }) =>
    z
      .object({
        accessToken: z.string().min(10),
        override: z.string().max(120).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("settings")
      .update({ parsha_override: data.override, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: list subscribers ----------
export const adminListSubscribers = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { data: rows, error } = await admin
      .from("subscribers")
      .select("id, email, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { subscribers: rows ?? [] };
  });

// ---------- Admin: list weekly skips for parsha+year ----------
export const adminListWeeklySkips = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; parshaKey: string; jewishYear: number }) =>
    z
      .object({
        accessToken: z.string().min(10),
        parshaKey: z.string().min(1).max(120),
        jewishYear: z.number().int().min(5000).max(7000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { data: rows, error } = await admin
      .from("weekly_skips")
      .select("title_key")
      .eq("parsha_key", data.parshaKey)
      .eq("jewish_year", data.jewishYear);
    if (error) throw new Error(error.message);
    return { titleKeys: (rows ?? []).map((r) => r.title_key as string) };
  });

// ---------- Admin: add a weekly skip ----------
export const adminAddWeeklySkip = createServerFn({ method: "POST" })
  .inputValidator((input: {
    accessToken: string;
    parshaKey: string;
    titleKey: string;
    jewishYear: number;
  }) =>
    z
      .object({
        accessToken: z.string().min(10),
        parshaKey: z.string().min(1).max(120),
        titleKey: z.string().min(1).max(300),
        jewishYear: z.number().int().min(5000).max(7000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { userId } = await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("weekly_skips")
      .insert({
        parsha_key: data.parshaKey,
        title_key: data.titleKey.toLowerCase(),
        jewish_year: data.jewishYear,
        created_by: userId,
      });
    if (error && !error.message.toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- Public: list active checklist source titles (ordered) ----------
export const listChecklistSources = createServerFn({ method: "GET" }).handler(async () => {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("checklist_sources")
    .select("title")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) {
    console.error("listChecklistSources error", error);
    return { titles: [] as string[] };
  }
  return { titles: (data ?? []).map((r) => r.title as string) };
});

// ---------- Admin: list ALL checklist sources ----------
export const adminListChecklistSources = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { data: rows, error } = await admin
      .from("checklist_sources")
      .select("id, title, active, sort_order, created_at")
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });
    if (error) throw new Error(error.message);
    return { sources: rows ?? [] };
  });

// ---------- Admin: add checklist source ----------
export const adminAddChecklistSource = createServerFn({ method: "POST" })
  .inputValidator((input: {
    accessToken: string;
    title: string;
    sortOrder: number;
  }) =>
    z
      .object({
        accessToken: z.string().min(10),
        title: z.string().min(1).max(200),
        sortOrder: z.number().int().min(0).max(100000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("checklist_sources")
      .insert({ title: data.title.trim(), sort_order: data.sortOrder, active: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: update checklist source (title / active / sort_order) ----------
export const adminUpdateChecklistSource = createServerFn({ method: "POST" })
  .inputValidator((input: {
    accessToken: string;
    id: string;
    title?: string;
    active?: boolean;
    sortOrder?: number;
  }) =>
    z
      .object({
        accessToken: z.string().min(10),
        id: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        active: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(100000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title.trim();
    if (data.active !== undefined) patch.active = data.active;
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await admin.from("checklist_sources").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: delete checklist source ----------
export const adminDeleteChecklistSource = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string().min(10), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("checklist_sources").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: list contact messages ----------
export const adminListContactMessages = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { data: rows, error } = await admin
      .from("contact_messages")
      .select("id, name, email, message, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { messages: rows ?? [] };
  });

// ---------- Admin: delete a contact message ----------
export const adminDeleteContactMessage = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string().min(10), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("contact_messages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Public: read announcement banner ----------
export type AnnouncementBanner = {
  enabled: boolean;
  text: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
};

export const getAnnouncementBanner = createServerFn({ method: "GET" }).handler(
  async (): Promise<AnnouncementBanner> => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("settings")
      .select("announcement_enabled, announcement_text, announcement_link_url, announcement_link_label")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      return { enabled: false, text: null, linkUrl: null, linkLabel: null };
    }
    return {
      enabled: Boolean(data.announcement_enabled),
      text: (data.announcement_text ?? null) as string | null,
      linkUrl: (data.announcement_link_url ?? null) as string | null,
      linkLabel: (data.announcement_link_label ?? null) as string | null,
    };
  },
);

// ---------- Admin: update announcement banner ----------
export const adminSetAnnouncementBanner = createServerFn({ method: "POST" })
  .inputValidator((input: {
    accessToken: string;
    enabled: boolean;
    text: string | null;
    linkUrl: string | null;
    linkLabel: string | null;
  }) =>
    z
      .object({
        accessToken: z.string().min(10),
        enabled: z.boolean(),
        text: z.string().trim().max(500).nullable(),
        linkUrl: z.string().trim().url().max(500).nullable().or(z.literal("").transform(() => null)),
        linkLabel: z.string().trim().max(120).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("settings")
      .update({
        announcement_enabled: data.enabled,
        announcement_text: data.text && data.text.length > 0 ? data.text : null,
        announcement_link_url: data.linkUrl && data.linkUrl.length > 0 ? data.linkUrl : null,
        announcement_link_label: data.linkLabel && data.linkLabel.length > 0 ? data.linkLabel : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: remove a weekly skip ----------
export const adminRemoveWeeklySkip = createServerFn({ method: "POST" })
  .inputValidator((input: {
    accessToken: string;
    parshaKey: string;
    titleKey: string;
    jewishYear: number;
  }) =>
    z
      .object({
        accessToken: z.string().min(10),
        parshaKey: z.string().min(1).max(120),
        titleKey: z.string().min(1).max(300),
        jewishYear: z.number().int().min(5000).max(7000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("weekly_skips")
      .delete()
      .eq("parsha_key", data.parshaKey)
      .eq("title_key", data.titleKey.toLowerCase())
      .eq("jewish_year", data.jewishYear);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
