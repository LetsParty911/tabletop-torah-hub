import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin, getSupabaseForUser } from "@/integrations/supabase/client.server";

// ---------- Public: list published PDFs for a parsha key ----------
export const listPublishedPdfs = createServerFn({ method: "GET" })
  .inputValidator((input: { parshaKey: string }) =>
    z.object({ parshaKey: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const { data: rows, error } = await admin
      .from("pdfs")
      .select("id, title, subtitle, file_path, parsha_key")
      .eq("parsha_key", data.parshaKey)
      .eq("published", true)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("listPublishedPdfs error", error);
      return { resources: [] as Array<{ id: string; title: string; subtitle: string | null; url: string }> };
    }
    const resources = await Promise.all(
      (rows ?? []).map(async (r) => {
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
export const listArchive = createServerFn({ method: "GET" }).handler(async () => {
  const admin = getSupabaseAdmin();
  const { data: rows, error } = await admin
    .from("pdfs")
    .select("id, title, subtitle, parsha_key, jewish_year, created_at")
    .eq("published", true)
    .order("jewish_year", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listArchive error", error);
    return { years: [] as Array<{ year: number; parshiyos: Array<{ parshaKey: string; pdfs: Array<{ id: string; title: string; subtitle: string | null }> }> }> };
  }
  // Group: year -> parshaKey -> pdfs[]
  const yearMap = new Map<number, Map<string, Array<{ id: string; title: string; subtitle: string | null; created_at: string }>>>();
  for (const r of rows ?? []) {
    const year = (r.jewish_year ?? 0) as number;
    if (!year) continue;
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
  const years = Array.from(yearMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, pmap]) => ({
      year,
      parshiyos: Array.from(pmap.entries())
        .map(([parshaKey, pdfs]) => {
          const latest = pdfs.reduce((m, p) => (p.created_at > m ? p.created_at : m), pdfs[0].created_at);
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
});

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
      .select("id, parsha_key, title, subtitle, file_path, published, created_at")
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
