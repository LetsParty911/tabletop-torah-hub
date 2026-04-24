import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin, getSupabaseForUser } from "@/integrations/supabase/client.server";
import { toParshaComparableKey } from "@/lib/parsha-normalize";
import { hebcalToParshaKey, hebcalYomTovToKey } from "@/lib/parshiyos";

// Build a map of normalized title -> sort_order from checklist_sources.
// This is the same admin-managed order shown in the admin UI (10/20/30/40…).
// Nulls / unknown titles should be sorted last by callers.
async function getTitleSortOrderMap(
  admin: ReturnType<typeof getSupabaseAdmin>,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const { data, error } = await admin
      .from("checklist_sources")
      .select("title, sort_order");
    if (error) {
      console.error("getTitleSortOrderMap error", error);
      return map;
    }
    for (const row of data ?? []) {
      const t = (row.title as string | null)?.trim().toLowerCase();
      const v = row.sort_order as number | null;
      if (t && typeof v === "number") map.set(t, v);
    }
  } catch (e) {
    console.error("getTitleSortOrderMap unexpected", e);
  }
  return map;
}

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
    // Sort by admin-managed display order from checklist_sources.sort_order
    // (joined by title, case-insensitive). Nulls go last.
    const orderMap = await getTitleSortOrderMap(admin);
    const orderFor = (title: string): number => {
      const v = orderMap.get(title.trim().toLowerCase());
      return typeof v === "number" ? v : 999999;
    };
    matched.sort((a, b) => orderFor(a.title) - orderFor(b.title));
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
    const orderMap = await getTitleSortOrderMap(admin);
    const orderFor = (title: string): number => {
      const v = orderMap.get(title.trim().toLowerCase());
      return typeof v === "number" ? v : 999999;
    };
    const liveCandidates = (rows ?? []).filter(
      (r) =>
        current.comparableKey &&
        toParshaComparableKey(r.parsha_key) === current.comparableKey,
    );
    const liveCollectionYear = liveCandidates.reduce<number | null>((latest, row) => {
      const year = typeof row.jewish_year === "number" ? row.jewish_year : null;
      if (year == null) return latest;
      if (latest == null || year > latest) return year;
      return latest;
    }, null);
    const yearMap = new Map<
      number,
      Map<string, Array<ArchivePdf & { created_at: string }>>
    >();
    for (const r of rows ?? []) {
      const year = (r.jewish_year ?? 0) as number;
      if (!year) continue;
      // Exclude the currently-featured live collection by the same archive group
      // key used to render it: current parsha comparable key + latest matching
      // jewish_year present in the published dataset.
      if (
        current.comparableKey &&
        liveCollectionYear === year &&
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
            const sortedPdfs = [...pdfs].sort(
              (a, b) => orderFor(a.title) - orderFor(b.title),
            );
            return {
              parshaKey,
              latest,
              pdfs: sortedPdfs.map(({ id, title, subtitle }) => ({ id, title, subtitle })),
            };
          })
          .sort((a, b) => (a.latest < b.latest ? 1 : -1))
          .map(({ parshaKey, pdfs }) => ({ parshaKey, pdfs })),
      }));
    return { years };
  },
);

// ---------- Public: get a single PDF (signed URL + title) by id ----------
export type PublicPdf = {
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
  createdAt: string | null;
  updatedAt: string | null;
  weekOf: string | null;
};

export const getPdfById = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    // Try selecting updated_at (may not exist in all environments); fall back
    // to the base set of columns if that column is missing.
    type PdfRow = {
      id: string;
      title: string;
      subtitle: string | null;
      file_path: string;
      published: boolean;
      created_at: string | null;
      week_of: string | null;
      updated_at?: string | null;
    };
    let row: PdfRow | null = null;
    const withUpdated = await admin
      .from("pdfs")
      .select("id, title, subtitle, file_path, published, created_at, week_of, updated_at")
      .eq("id", data.id)
      .maybeSingle();
    if (withUpdated.error) {
      const fallback = await admin
        .from("pdfs")
        .select("id, title, subtitle, file_path, published, created_at, week_of")
        .eq("id", data.id)
        .maybeSingle();
      if (fallback.error) {
        return { pdf: null as null | PublicPdf };
      }
      row = (fallback.data ?? null) as PdfRow | null;
    } else {
      row = (withUpdated.data ?? null) as PdfRow | null;
    }
    if (!row || !row.published) {
      return { pdf: null as null | PublicPdf };
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
        createdAt: row.created_at ?? null,
        updatedAt: row.updated_at ?? null,
        weekOf: row.week_of ?? null,
      } as PublicPdf,
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

// ---------- Public: subscribe email (unsubscribe-aware reactivation) ----------
export const subscribeEmail = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) =>
    z.object({ email: z.string().email().max(254) }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const email = data.email.toLowerCase();
    const tag = `[subscribe:${email.slice(0, 2)}***@${email.split("@")[1] ?? "?"}]`;

    console.log(`${tag} function start`);
    console.log(`${tag} received email address`, email);

    // Look up an existing row first so we can reactivate cleanly instead of
    // hitting a duplicate-key error or leaving an unsubscribed row inactive.
    const { data: existing } = await admin
      .from("subscribers")
      .select("id, active, unsubscribe_token")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      if (!existing.active) {
        const { error: upErr } = await admin
          .from("subscribers")
          .update({ active: true, unsubscribed_at: null })
          .eq("id", existing.id);
        if (upErr) {
          console.error(`${tag} reactivate error`, upErr);
          return { ok: false, error: "Could not subscribe. Please try again." };
        }
        console.log(`${tag} email saved to database successfully`, {
          mode: "reactivated_existing",
          subscriberId: existing.id,
        });
        console.log(`${tag} reactivated -> sending welcome`);
        const r = await sendWelcomeEmailSafe(email, existing.unsubscribe_token ?? null);
        console.log(`${tag} welcome result`, r);
      } else {
        console.log(`${tag} email saved to database successfully`, {
          mode: "already_active_existing",
          subscriberId: existing.id,
        });
        console.log(`${tag} already active -> welcome skipped (not a new subscription)`);
      }
      return { ok: true, error: null };
    }

    const { error } = await admin.from("subscribers").insert({ email });
    if (error) {
      if (error.message.toLowerCase().includes("duplicate")) {
        console.log(`${tag} email save hit duplicate race`, { email });
        console.log(`${tag} insert race duplicate -> welcome skipped`);
        return { ok: true, error: null };
      }
      console.error(`${tag} insert error`, error);
      return { ok: false, error: "Could not subscribe. Please try again." };
    }
    console.log(`${tag} email saved to database successfully`, {
      mode: "new_insert",
      email,
    });

    // Fetch the unsubscribe_token that was generated by the DB default so we
    // can include a working unsubscribe link in the welcome email.
    const { data: fresh } = await admin
      .from("subscribers")
      .select("unsubscribe_token")
      .eq("email", email)
      .maybeSingle();
    console.log(`${tag} new subscriber -> sending welcome (hasToken=${Boolean(fresh?.unsubscribe_token)})`);
    const r = await sendWelcomeEmailSafe(email, fresh?.unsubscribe_token ?? null);
    console.log(`${tag} welcome result`, r);

    return { ok: true, error: null };
  });

// ---------- Internal: welcome email for new subscribers ----------
// Best-effort: a send failure must NEVER break the subscribe flow.
// Returns a small status object so callers can log what happened without
// exposing secrets or full email addresses.
type WelcomeEmailResult =
  | { attempted: false; reason: "not_configured"; missing: string[] }
  | { attempted: true; ok: true; status: number }
  | { attempted: true; ok: false; status: number; errorSnippet: string }
  | { attempted: true; ok: false; status: 0; errorSnippet: string };

async function sendWelcomeEmailSafe(
  email: string,
  unsubscribeToken: string | null,
): Promise<WelcomeEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  console.log("[welcome-email] function start", { to: email });
  console.log("[welcome-email] RESEND_API_KEY exists", Boolean(apiKey));
  console.log("[welcome-email] EMAIL_FROM_ADDRESS exists", Boolean(fromAddress));
  const missing: string[] = [];
  if (!apiKey) missing.push("RESEND_API_KEY");
  if (!fromAddress) missing.push("EMAIL_FROM_ADDRESS");
  if (missing.length > 0) {
    // Email not configured in this environment — skip, but surface WHY.
    console.warn(`welcome email skipped: missing env ${missing.join(",")}`);
    return { attempted: false, reason: "not_configured", missing };
  }

  const SITE_URL = "https://torahforthetable.com";
  const unsubscribeUrl = unsubscribeToken
    ? `${SITE_URL}/unsubscribe/${unsubscribeToken}`
    : null;

  const subject = "Welcome to Torah for the Table";

  const textLines = [
    "Shalom and welcome to Torah for the Table.",
    "",
    "Thank you for subscribing. You're now on the list to receive our weekly Divrei Torah collection.",
    "",
    "Expect a new email each week, usually Thursday or Friday, with that week's parsha resources ready for your Shabbos table.",
    "",
    unsubscribeUrl
      ? `You can unsubscribe anytime using the link at the bottom of any email, or directly here: ${unsubscribeUrl}`
      : "You can unsubscribe anytime using the link at the bottom of any email we send you.",
    "",
    "— Torah for the Table",
    SITE_URL,
  ];
  const text = textLines.join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#2a1a0a;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;line-height:1.55;">
    <h1 style="font-size:22px;margin:0 0 16px;color:#5a3a1f;">Welcome to Torah for the Table</h1>
    <p style="margin:0 0 14px;">Shalom and welcome.</p>
    <p style="margin:0 0 14px;">Thank you for subscribing. You&rsquo;re now on the list to receive our weekly Divrei Torah collection.</p>
    <p style="margin:0 0 14px;">Expect a new email each week, usually <strong>Thursday or Friday</strong>, with that week&rsquo;s parsha resources ready for your Shabbos table.</p>
    <p style="margin:0 0 14px;color:#55575d;font-size:13px;">
      You can unsubscribe anytime using the link at the bottom of any email we send you${unsubscribeUrl ? `, or directly <a href="${unsubscribeUrl}" style="color:#5a3a1f;">here</a>` : ""}.
    </p>
    <p style="margin:24px 0 0;">&mdash; Torah for the Table<br><a href="${SITE_URL}/" style="color:#5a3a1f;">${SITE_URL}</a></p>
  </div>
</body></html>`;

  const headers: Record<string, string> = {};
  if (unsubscribeUrl) headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;

  console.log("[welcome-email] exact from address", fromAddress);
  console.log("[welcome-email] exact to address", email);

  try {
    const resendPayload = {
      from: fromAddress,
      to: email,
      subject,
      html,
      text,
      ...(unsubscribeUrl ? { headers } : {}),
    };
    console.log("[welcome-email] resend send call is being attempted", {
      from: resendPayload.from,
      to: resendPayload.to,
      hasHeaders: Boolean(unsubscribeUrl),
    });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(resendPayload),
    });
    const rawResponseBody = await res.text().catch(() => "");
    let parsedResponseBody: unknown = rawResponseBody || null;
    if (rawResponseBody) {
      try {
        parsedResponseBody = JSON.parse(rawResponseBody);
      } catch {
        parsedResponseBody = rawResponseBody;
      }
    }
    console.log("[welcome-email] full resend response object", {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      body: parsedResponseBody,
    });
    if (!res.ok) {
      const errText = rawResponseBody.slice(0, 200);
      console.error(`welcome email send failed status=${res.status}`, errText);
      return { attempted: true, ok: false, status: res.status, errorSnippet: errText };
    }
    return { attempted: true, ok: true, status: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("welcome email network error", { message: msg, stack });
    return { attempted: true, ok: false, status: 0, errorSnippet: msg.slice(0, 200) };
  }
}


// ---------- Admin: send TEST welcome email to any address ----------
// Lets an admin trigger the welcome email on demand for QA, without
// touching the subscribers table. Does NOT create a subscription row.
export const adminSendTestWelcomeEmail = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; email: string }) =>
    z
      .object({
        accessToken: z.string().min(10),
        email: z.string().trim().email().max(254),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const email = data.email.toLowerCase();

    // If this email already exists as a subscriber, reuse its real
    // unsubscribe token so the test link actually works. Otherwise send
    // without an unsubscribe link (still safe — footer explains).
    const admin = getSupabaseAdmin();
    const { data: existing } = await admin
      .from("subscribers")
      .select("unsubscribe_token")
      .eq("email", email)
      .maybeSingle();

    const tag = `[admin-test-welcome:${email.replace(/(.{2}).+(@.+)/, "$1***$2")}]`;
    console.log(`${tag} sending test welcome (hasToken=${Boolean(existing?.unsubscribe_token)})`);
    const result = await sendWelcomeEmailSafe(email, existing?.unsubscribe_token ?? null);
    console.log(`${tag} result`, result);
    return { ok: true, result };
  });

// ---------- Admin: reset my subscriber row (for retesting the welcome flow) ----------
// Deletes the subscribers row for a given email so the next subscribe is
// treated as a brand-new signup and triggers the welcome email path.
export const adminResetSubscriber = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; email: string }) =>
    z
      .object({
        accessToken: z.string().min(10),
        email: z.string().trim().email().max(254),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const email = data.email.toLowerCase();
    const { error, count } = await admin
      .from("subscribers")
      .delete({ count: "exact" })
      .eq("email", email);
    if (error) throw new Error(error.message);
    return { ok: true, deleted: count ?? 0 };
  });

// ---------- Admin: preflight Resend / From address verification ----------
// Validates env presence and calls Resend's GET /domains to check whether
// the domain inside EMAIL_FROM_ADDRESS appears verified for sending.
// Never returns secret values.
export const adminResendPreflight = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);

    const apiKey = process.env.RESEND_API_KEY;
    const fromRaw = process.env.EMAIL_FROM_ADDRESS ?? "";

    const missing: string[] = [];
    if (!apiKey) missing.push("RESEND_API_KEY");
    if (!fromRaw) missing.push("EMAIL_FROM_ADDRESS");
    if (missing.length > 0) {
      return {
        ok: false as const,
        step: "env" as const,
        missing,
        message: `Missing env: ${missing.join(", ")}`,
      };
    }

    // Parse "Name <addr@domain>" or plain "addr@domain"
    const m = fromRaw.match(/<\s*([^<>@\s]+@[^<>@\s]+)\s*>/);
    const fromAddr = (m?.[1] ?? fromRaw).trim();
    const fromDomain = fromAddr.split("@")[1]?.toLowerCase() ?? "";
    const fromDisplay = fromRaw.includes("<") ? fromRaw : fromAddr;

    if (!fromDomain) {
      return {
        ok: false as const,
        step: "parse" as const,
        fromDisplay,
        message: `Could not parse a domain from EMAIL_FROM_ADDRESS.`,
      };
    }

    // Special-case Resend's shared sandbox sender.
    if (fromDomain === "resend.dev") {
      return {
        ok: true as const,
        step: "sandbox" as const,
        fromDisplay,
        fromDomain,
        verified: true,
        sandbox: true,
        message:
          "Using Resend sandbox sender (resend.dev). Deliverable ONLY to the Resend account owner's email. Switch to a verified domain for real subscribers.",
      };
    }

    // Ask Resend for the list of domains on this account.
    let domainsResp: Response;
    try {
      domainsResp = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false as const,
        step: "network" as const,
        fromDisplay,
        fromDomain,
        message: `Network error calling Resend: ${msg.slice(0, 200)}`,
      };
    }

    if (!domainsResp.ok) {
      const errText = (await domainsResp.text().catch(() => "")).slice(0, 300);
      return {
        ok: false as const,
        step: "resend_auth" as const,
        status: domainsResp.status,
        fromDisplay,
        fromDomain,
        message:
          domainsResp.status === 401 || domainsResp.status === 403
            ? "Resend rejected the API key (401/403). Double-check RESEND_API_KEY."
            : `Resend /domains returned ${domainsResp.status}.`,
        errorSnippet: errText,
      };
    }

    type RDomain = { name?: string; status?: string; region?: string };
    const body = (await domainsResp.json().catch(() => ({}))) as {
      data?: RDomain[];
    };
    const domains = Array.isArray(body.data) ? body.data : [];

    const match = domains.find(
      (d) => (d.name ?? "").toLowerCase() === fromDomain,
    );

    if (!match) {
      return {
        ok: false as const,
        step: "domain_missing" as const,
        fromDisplay,
        fromDomain,
        availableDomains: domains.map((d) => ({
          name: d.name ?? "",
          status: d.status ?? "",
        })),
        message: `Domain "${fromDomain}" is NOT on this Resend account. Add & verify it in Resend, or change EMAIL_FROM_ADDRESS to a domain that is.`,
      };
    }

    const status = (match.status ?? "").toLowerCase();
    const verified = status === "verified";
    return {
      ok: verified,
      step: "domain_status" as const,
      fromDisplay,
      fromDomain,
      status: match.status ?? "unknown",
      verified,
      sandbox: false,
      message: verified
        ? `Domain "${fromDomain}" is VERIFIED in Resend. Production-ready.`
        : `Domain "${fromDomain}" exists in Resend but status is "${match.status}". Finish DNS verification before sending to real subscribers.`,
    };
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

// =====================================================================
// Weekly Email System v1
// =====================================================================

const SITE_URL = "https://torahforthetable.com";

type WeeklyEmailResource = {
  id: string;
  title: string;
  subtitle: string | null;
};

type WeeklyEmailContent = {
  ready: boolean;
  reason: string | null;
  parshaKey: string | null;
  parshaLabel: string | null;
  jewishYear: number | null;
  subject: string;
  intro: string;
  resources: WeeklyEmailResource[];
  alreadySent: {
    sentAt: string;
    sentCount: number;
    subject: string;
  } | null;
  activeSubscriberCount: number;
  emailConfigured: boolean;
};

function buildIntro(): string {
  return "This week's Divrei Torah are now available to view or download.";
}

function buildSubject(parshaLabel: string): string {
  return `This Week's Divrei Torah for Shabbos — ${parshaLabel}`;
}

function emailHtml(params: {
  parshaLabel: string;
  intro: string;
  resources: WeeklyEmailResource[];
  unsubscribeUrl: string;
}): string {
  const { parshaLabel, intro, resources, unsubscribeUrl } = params;
  const items = resources
    .map((r) => {
      const view = `${SITE_URL}/view/${r.id}`;
      const download = `${SITE_URL}/view/${r.id}/download`;
      const sub = r.subtitle
        ? `<div style="color:#6b6358;font-size:13px;margin-top:2px;">${escapeHtml(r.subtitle)}</div>`
        : "";
      return `
        <li style="margin:0 0 18px 0;">
          <div style="font-weight:600;color:#2c2418;font-size:15px;">${escapeHtml(r.title)}</div>
          ${sub}
          <div style="margin-top:6px;font-size:14px;">
            <a href="${view}" style="color:#5a3a1f;text-decoration:underline;margin-right:14px;">View</a>
            <a href="${download}" style="color:#5a3a1f;text-decoration:underline;">Download</a>
          </div>
        </li>`;
    })
    .join("");

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:Georgia,'Times New Roman',serif;color:#2c2418;line-height:1.55;">
    <h1 style="font-size:22px;margin:0 0 6px 0;color:#2c2418;">${escapeHtml(parshaLabel)}</h1>
    <p style="margin:0 0 20px 0;font-size:15px;color:#3a2f22;">${escapeHtml(intro)}</p>
    <ul style="list-style:none;padding:0;margin:0 0 28px 0;">${items}</ul>
    <hr style="border:none;border-top:1px solid #e5dfd2;margin:24px 0;" />
    <p style="font-size:13px;color:#6b6358;margin:0 0 8px 0;">
      <a href="${SITE_URL}/" style="color:#5a3a1f;text-decoration:underline;margin-right:12px;">Homepage</a>
      <a href="${SITE_URL}/archive" style="color:#5a3a1f;text-decoration:underline;margin-right:12px;">Archive</a>
      <a href="${unsubscribeUrl}" style="color:#6b6358;text-decoration:underline;">Unsubscribe</a>
    </p>
  </div>
</body></html>`;
}

function emailText(params: {
  parshaLabel: string;
  intro: string;
  resources: WeeklyEmailResource[];
  unsubscribeUrl: string;
}): string {
  const { parshaLabel, intro, resources, unsubscribeUrl } = params;
  const lines = [parshaLabel, "", intro, ""];
  for (const r of resources) {
    lines.push(r.title);
    if (r.subtitle) lines.push(r.subtitle);
    lines.push(`View: ${SITE_URL}/view/${r.id}`);
    lines.push(`Download: ${SITE_URL}/view/${r.id}/download`);
    lines.push("");
  }
  lines.push("---");
  lines.push(`Homepage: ${SITE_URL}/`);
  lines.push(`Archive: ${SITE_URL}/archive`);
  lines.push(`Unsubscribe: ${unsubscribeUrl}`);
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Resolve current parsha display label (mirrors homepage / use-current-parsha
// without importing client-only code).
async function resolveCurrentParshaLabel(): Promise<{
  parshaKey: string | null;
  parshaLabel: string | null;
  jewishYear: number | null;
}> {
  const featured = await resolveCurrentFeatured();
  if (!featured.comparableKey) {
    return { parshaKey: null, parshaLabel: null, jewishYear: featured.jewishYear };
  }
  // We need the "human" parsha key (not normalized). Re-derive from override
  // or Hebcal — same logic as resolveCurrentFeatured but keep raw label.
  const admin = getSupabaseAdmin();
  let rawKey: string | null = null;
  try {
    const { data: s } = await admin
      .from("settings")
      .select("parsha_override")
      .eq("id", 1)
      .maybeSingle();
    if (s?.parsha_override) rawKey = s.parsha_override;
  } catch { /* ignore */ }

  if (!rawKey) {
    try {
      const res = await fetch("https://www.hebcal.com/shabbat?cfg=json&geonameid=5128581&M=on");
      const data = (await res.json()) as {
        items?: Array<{ title: string; category: string; subcat?: string; date: string }>;
      };
      const items = data?.items ?? [];
      const parsha = items.find((i) => i.category === "parashat");
      const yomTov = parsha
        ? items.find(
            (i) =>
              i.category === "holiday" &&
              i.subcat === "major" &&
              i.date.slice(0, 10) === parsha.date.slice(0, 10),
          )
        : undefined;
      if (yomTov) {
        rawKey = hebcalYomTovToKey(yomTov.title) ?? yomTov.title;
      } else if (parsha) {
        rawKey = hebcalToParshaKey(parsha.title);
      }
    } catch { /* ignore */ }
  }

  const KNOWN_YOM_TOV = [
    "Rosh Hashanah", "Yom Kippur", "Sukkos", "Shemini Atzeres",
    "Simchas Torah", "Pesach", "Shavuos",
  ];
  let label: string | null = null;
  if (rawKey) {
    if (rawKey.startsWith("Parshas")) label = rawKey;
    else if (KNOWN_YOM_TOV.includes(rawKey)) label = rawKey;
    else label = `Parshas ${rawKey}`;
  }
  return { parshaKey: rawKey, parshaLabel: label, jewishYear: featured.jewishYear };
}

async function getWeeklyEmailContentInternal(): Promise<WeeklyEmailContent> {
  const admin = getSupabaseAdmin();
  const { parshaKey, parshaLabel, jewishYear } = await resolveCurrentParshaLabel();

  const emailConfigured =
    Boolean(process.env.RESEND_API_KEY) && Boolean(process.env.EMAIL_FROM_ADDRESS);

  // Active subscriber count
  const { count: activeCount } = await admin
    .from("subscribers")
    .select("id", { count: "exact", head: true })
    .eq("active", true);
  const activeSubscriberCount = activeCount ?? 0;

  if (!parshaKey || !parshaLabel || !jewishYear) {
    return {
      ready: false,
      reason: "Could not determine the current week's parsha.",
      parshaKey,
      parshaLabel,
      jewishYear,
      subject: "",
      intro: buildIntro(),
      resources: [],
      alreadySent: null,
      activeSubscriberCount,
      emailConfigured,
    };
  }

  // Already-sent lookup
  const { data: sentRow } = await admin
    .from("weekly_email_sends")
    .select("sent_at, sent_count, subject")
    .eq("parsha_key", parshaKey)
    .eq("jewish_year", jewishYear)
    .maybeSingle();
  const alreadySent = sentRow
    ? {
        sentAt: sentRow.sent_at as string,
        sentCount: (sentRow.sent_count as number) ?? 0,
        subject: (sentRow.subject as string) ?? "",
      }
    : null;

  // Pull current week's published PDFs (same comparable-key match as homepage)
  const target = toParshaComparableKey(parshaKey);
  const { data: rows } = await admin
    .from("pdfs")
    .select("id, title, subtitle, parsha_key, jewish_year, created_at")
    .eq("published", true)
    .order("created_at", { ascending: false });
  const matched = (rows ?? []).filter(
    (r) => toParshaComparableKey(r.parsha_key) === target,
  );
  const orderMap = await getTitleSortOrderMap(admin);
  const orderFor = (t: string) => {
    const v = orderMap.get(t.trim().toLowerCase());
    return typeof v === "number" ? v : 999999;
  };
  matched.sort((a, b) => orderFor(a.title) - orderFor(b.title));
  const resources: WeeklyEmailResource[] = matched.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    subtitle: (r.subtitle as string | null) ?? null,
  }));

  const subject = buildSubject(parshaLabel);
  const intro = buildIntro();

  let reason: string | null = null;
  if (!emailConfigured) reason = "Email is not configured yet (RESEND_API_KEY / EMAIL_FROM_ADDRESS missing).";
  else if (resources.length === 0) reason = "No published PDFs for this week yet.";
  else if (activeSubscriberCount === 0) reason = "No active subscribers.";
  else if (alreadySent) reason = "This week's email has already been sent.";

  return {
    ready: reason === null,
    reason,
    parshaKey,
    parshaLabel,
    jewishYear,
    subject,
    intro,
    resources,
    alreadySent,
    activeSubscriberCount,
    emailConfigured,
  };
}

// ---------- Admin: preview current week's email ----------
export const adminGetWeeklyEmailPreview = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    return await getWeeklyEmailContentInternal();
  });

// ---------- Admin: list weekly send history ----------
export const adminListWeeklyEmailSends = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { data: rows, error } = await admin
      .from("weekly_email_sends")
      .select("id, parsha_key, jewish_year, subject, sent_at, sent_count, provider, notes")
      .order("sent_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { sends: rows ?? [] };
  });

// ---------- Admin: send the weekly email ----------
export const adminSendWeeklyEmail = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { userId } = await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();

    const content = await getWeeklyEmailContentInternal();
    if (!content.ready || !content.parshaKey || !content.jewishYear) {
      return { ok: false, error: content.reason ?? "Cannot send right now." };
    }

    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.EMAIL_FROM_ADDRESS;
    if (!apiKey || !fromAddress) {
      return { ok: false, error: "Email is not configured (missing RESEND_API_KEY / EMAIL_FROM_ADDRESS)." };
    }

    // Pull active subscribers (email + token) for personalized unsubscribe links.
    const { data: subs, error: subsErr } = await admin
      .from("subscribers")
      .select("email, unsubscribe_token")
      .eq("active", true);
    if (subsErr) {
      return { ok: false, error: `Could not load subscribers: ${subsErr.message}` };
    }
    const recipients = (subs ?? []).filter(
      (s) => typeof s.email === "string" && typeof s.unsubscribe_token === "string",
    );
    if (recipients.length === 0) {
      return { ok: false, error: "No active subscribers." };
    }

    let sentCount = 0;
    let firstMessageId: string | null = null;
    const failures: string[] = [];

    for (const r of recipients) {
      const unsubscribeUrl = `${SITE_URL}/unsubscribe/${r.unsubscribe_token}`;
      const html = emailHtml({
        parshaLabel: content.parshaLabel!,
        intro: content.intro,
        resources: content.resources,
        unsubscribeUrl,
      });
      const text = emailText({
        parshaLabel: content.parshaLabel!,
        intro: content.intro,
        resources: content.resources,
        unsubscribeUrl,
      });
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: fromAddress,
            to: r.email,
            subject: content.subject,
            html,
            text,
            headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
          }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          failures.push(`${r.email}: ${res.status} ${errText.slice(0, 120)}`);
        } else {
          sentCount++;
          if (!firstMessageId) {
            try {
              const j = (await res.json()) as { id?: string };
              if (j?.id) firstMessageId = j.id;
            } catch { /* ignore */ }
          }
        }
      } catch (e) {
        failures.push(`${r.email}: ${e instanceof Error ? e.message : "send failed"}`);
      }
    }

    if (sentCount === 0) {
      return {
        ok: false,
        error: `All sends failed. First error: ${failures[0] ?? "unknown"}`,
      };
    }

    // Record the send. Unique constraint protects against duplicates if
    // somehow invoked twice in parallel.
    const { error: insErr } = await admin.from("weekly_email_sends").insert({
      parsha_key: content.parshaKey,
      jewish_year: content.jewishYear,
      subject: content.subject,
      sent_count: sentCount,
      created_by: userId,
      provider: "resend",
      provider_message_id: firstMessageId,
      notes: failures.length > 0 ? `Partial: ${failures.length} failed` : null,
    });
    if (insErr) {
      // Send happened but logging failed — surface as warning, do not fail UI.
      return {
        ok: true,
        sentCount,
        failedCount: failures.length,
        warning: `Sent ${sentCount} but could not record history: ${insErr.message}`,
      };
    }

    return {
      ok: true,
      sentCount,
      failedCount: failures.length,
      warning: failures.length > 0
        ? `${failures.length} send(s) failed but ${sentCount} succeeded.`
        : null,
    };
  });

// ---------- Public: validate unsubscribe token (no-op read) ----------
export const lookupUnsubscribe = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) =>
    z.object({ token: z.string().min(8).max(128) }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const { data: row } = await admin
      .from("subscribers")
      .select("email, active")
      .eq("unsubscribe_token", data.token)
      .maybeSingle();
    if (!row) return { found: false, alreadyInactive: false, email: null as string | null };
    return {
      found: true,
      alreadyInactive: !row.active,
      email: row.email as string,
    };
  });

// ---------- Public: confirm unsubscribe ----------
export const confirmUnsubscribe = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) =>
    z.object({ token: z.string().min(8).max(128) }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const { data: row } = await admin
      .from("subscribers")
      .select("id, active")
      .eq("unsubscribe_token", data.token)
      .maybeSingle();
    if (!row) return { ok: false, alreadyInactive: false, error: "Link is invalid." };
    if (!row.active) return { ok: true, alreadyInactive: true, error: null };
    const { error } = await admin
      .from("subscribers")
      .update({ active: false, unsubscribed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return { ok: false, alreadyInactive: false, error: "Could not unsubscribe. Please try again." };
    return { ok: true, alreadyInactive: false, error: null };
  });
