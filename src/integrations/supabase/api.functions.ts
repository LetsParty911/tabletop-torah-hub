import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin, getSupabaseForUser } from "@/integrations/supabase/ext.server";
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

// Canonical publications: maps pdfs.id -> { name, publisher } via pdfs.publication_id.
// Tolerates the table/column not existing yet (pre-migration) by returning an empty map,
// in which case callers fall back to pdfs.title.
type CanonicalInfo = { name: string; publisher: string | null };
async function getCanonicalByPdfId(
  admin: ReturnType<typeof getSupabaseAdmin>,
): Promise<Map<string, CanonicalInfo>> {
  const out = new Map<string, CanonicalInfo>();
  try {
    const pubs = await admin.from("publications").select("id, name, publisher");
    if (pubs.error) return out;
    const byId = new Map<string, CanonicalInfo>(
      (pubs.data ?? []).map((p: any) => [
        p.id as string,
        { name: p.name as string, publisher: (p.publisher as string | null) ?? null },
      ]),
    );
    const links = await admin.from("pdfs").select("id, publication_id");
    if (links.error) return out;
    for (const r of links.data ?? []) {
      const info = r.publication_id ? byId.get(r.publication_id as string) : undefined;
      if (info?.name) out.set(r.id as string, info);
    }
  } catch {
    /* pre-migration: fall back to titles */
  }
  return out;
}


export type CanonicalPublication = {
  id: string;
  name: string;
  publisher: string | null;
  default_audience: string | null;
  default_format_type: string | null;
  sort_order: number;
  active: boolean;
};

// Public list of canonical publications (empty before the migration runs).
export const listCanonicalPublications = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ publications: CanonicalPublication[] }> => {
    const admin = getSupabaseAdmin();
    try {
      const { data, error } = await admin
        .from("publications")
        .select("id, name, publisher, default_audience, default_format_type, sort_order, active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) return { publications: [] };
      return { publications: (data ?? []) as CanonicalPublication[] };
    } catch {
      return { publications: [] };
    }
  },
);

// Fetch the current Shabbos date (YYYY-MM-DD, NYC timezone) from Hebcal.
// Returns null if Hebcal is unreachable or no parsha item is present.
async function fetchCurrentShabbosDate(): Promise<string | null> {
  try {
    const res = await fetch(
      "https://www.hebcal.com/shabbat?cfg=json&geonameid=5128581&M=on",
    );
    const data = (await res.json()) as {
      items?: Array<{ category: string; date: string }>;
    };
    const parsha = data?.items?.find((i) => i.category === "parashat");
    return parsha?.date?.slice(0, 10) ?? null;
  } catch {
    return null;
  }
}

// An override is "for the current week" if it was last updated on or after
// the Sunday before the upcoming Shabbos (i.e. within the same Hebcal week).
// If the override is older than that, it's considered stale and ignored so
// Hebcal automatically takes over.
function isOverrideCurrent(updatedAt: string | null, shabbosDate: string | null): boolean {
  if (!updatedAt || !shabbosDate) return false;
  // Window start: Sunday on/before shabbosDate. Shabbos is Saturday, so the
  // Sunday that opens the week is shabbosDate - 6 days (UTC math is fine,
  // we only compare calendar dates).
  const shabbos = new Date(`${shabbosDate}T00:00:00Z`);
  const windowStart = new Date(shabbos.getTime() - 6 * 24 * 60 * 60 * 1000);
  // Window end: end of Shabbos day.
  const windowEnd = new Date(shabbos.getTime() + 24 * 60 * 60 * 1000 - 1);
  const updated = new Date(updatedAt);
  return updated >= windowStart && updated <= windowEnd;
}

// Read the parsha override only if it is still active for the current week.
// Stale overrides (set for a previous Shabbos) return null so Hebcal wins.
async function readActiveParshaOverride(
  admin: ReturnType<typeof getSupabaseAdmin>,
  shabbosDate: string | null,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("settings")
      .select("parsha_override, updated_at")
      .eq("id", 1)
      .maybeSingle();
    const override = (data?.parsha_override as string | null) ?? null;
    const updatedAt = (data?.updated_at as string | null) ?? null;
    if (!override) return null;
    if (!isOverrideCurrent(updatedAt, shabbosDate)) return null;
    return override;
  } catch {
    return null;
  }
}

// Resolve the currently-featured parsha (key + Hebrew year) the same way the
// homepage does: settings override first (only if active for this week),
// otherwise Hebcal. Used to exclude the live week from the archive.
async function resolveCurrentFeatured(): Promise<{
  comparableKey: string | null;
  jewishYear: number | null;
}> {
  let parshaKey: string | null = null;
  let jewishYear: number | null = null;
  let shabbosDate: string | null = null;

  try {
    const res = await fetch(
      "https://www.hebcal.com/shabbat?cfg=json&geonameid=5128581&M=on",
    );
    const data = (await res.json()) as {
      items?: Array<{ title: string; category: string; subcat?: string; date: string; hdate?: string }>;
    };
    const items = data?.items ?? [];
    const parsha = items.find((i) => i.category === "parashat");
    shabbosDate = parsha?.date?.slice(0, 10) ?? null;
    const yomTovOnShabbos = parsha
      ? items.find(
          (i) =>
            i.category === "holiday" &&
            i.subcat === "major" &&
            i.date.slice(0, 10) === parsha.date.slice(0, 10),
        )
      : undefined;

    if (yomTovOnShabbos) {
      parshaKey = hebcalYomTovToKey(yomTovOnShabbos.title) ?? yomTovOnShabbos.title;
    } else if (parsha) {
      parshaKey = hebcalToParshaKey(parsha.title);
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

  // Override only wins if it was set during this Hebcal week.
  try {
    const admin = getSupabaseAdmin();
    const activeOverride = await readActiveParshaOverride(admin, shabbosDate);
    if (activeOverride) parshaKey = activeOverride;
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
type PdfResource = {
  id: string;
  title: string;
  publisher: string | null;
  subtitle: string | null;
  url: string;
  summary_quick: string | null;
  content_type: string | null;
  summary_audio_path: string | null;
  primary_category: string | null;
  publication: string | null;
  tags: string[];
  description: string | null;
  audience: string | null;
  format_type: string | null;
  page_count: number | null;
  badge: string | null;
  featured_slot: string | null;
};

async function fetchAllPublishedRows(admin: ReturnType<typeof getSupabaseAdmin>) {
  const withSlot = await admin
    .from("pdfs")
    .select("id, title, subtitle, file_path, parsha_key, jewish_year, created_at, summary_quick, content_type, summary_audio_path, primary_category, tags, publication, description, audience, format_type, page_count, badge, featured_slot")
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (!withSlot.error) return withSlot.data ?? [];
  const withMeta = await admin
    .from("pdfs")
    .select("id, title, subtitle, file_path, parsha_key, jewish_year, created_at, summary_quick, content_type, summary_audio_path, primary_category, tags, publication, description, audience, format_type, page_count, badge")
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (!withMeta.error) return withMeta.data ?? [];
  const withPub = await admin
    .from("pdfs")
    .select("id, title, subtitle, file_path, parsha_key, jewish_year, created_at, summary_quick, content_type, summary_audio_path, primary_category, tags, publication")
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (!withPub.error) return withPub.data ?? [];
  const withCats = await admin
    .from("pdfs")
    .select("id, title, subtitle, file_path, parsha_key, jewish_year, created_at, summary_quick, content_type, summary_audio_path, primary_category, tags")
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (!withCats.error) return withCats.data ?? [];
  const fb = await admin
    .from("pdfs")
    .select("id, title, subtitle, file_path, parsha_key, jewish_year, created_at, summary_quick, content_type, summary_audio_path")
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (fb.error) {
    console.error("fetchAllPublishedRows error", fb.error);
    return [];
  }
  return fb.data ?? [];
}

async function buildResources(
  admin: ReturnType<typeof getSupabaseAdmin>,
  rows: any[],
): Promise<PdfResource[]> {
  const orderMap = await getTitleSortOrderMap(admin);
  const canonical = await getCanonicalByPdfId(admin);
  const displayTitle = (r: any): string => canonical.get(r.id as string)?.name ?? r.title;
  const orderFor = (title: string): number => {
    const v = orderMap.get(title.trim().toLowerCase());
    return typeof v === "number" ? v : 999999;
  };
  const sorted = [...rows].sort(
    (a, b) => orderFor(displayTitle(a)) - orderFor(displayTitle(b)),
  );
  return Promise.all(
    sorted.map(async (r: any) => {
      const { data: signed } = await admin.storage
        .from("pdfs")
        .createSignedUrl(r.file_path, 60 * 60);
      return {
        id: r.id,
        title: displayTitle(r),
        publisher: canonical.get(r.id as string)?.publisher ?? null,
        subtitle: r.subtitle,
        url: signed?.signedUrl ?? "#",
        summary_quick: r.summary_quick,
        content_type: r.content_type,
        summary_audio_path: r.summary_audio_path ?? null,
        primary_category: (r.primary_category as string | null) ?? null,
        publication: (r.publication as string | null) ?? null,
        tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
        description: (r.description as string | null) ?? null,
        audience: (r.audience as string | null) ?? null,
        format_type: (r.format_type as string | null) ?? null,
        page_count: typeof r.page_count === "number" ? r.page_count : null,
        badge: (r.badge as string | null) ?? null,
        featured_slot: (r.featured_slot as string | null) ?? null,
      };
    }),
  );
}

// Determines which (parsha_key, jewish_year) collection the homepage displays:
// live parsha if it has published PDFs, otherwise the most recent published
// (parsha_key, jewish_year) group (fallback).
async function resolveDisplayedCollection(
  admin: ReturnType<typeof getSupabaseAdmin>,
  liveComparableKey: string | null,
): Promise<{
  comparableKey: string | null;
  parshaKey: string | null;
  jewishYear: number | null;
  rows: any[];
  isFallback: boolean;
}> {
  const allRows = await fetchAllPublishedRows(admin);
  if (liveComparableKey) {
    const liveRows = allRows.filter(
      (r: any) => toParshaComparableKey(r.parsha_key) === liveComparableKey,
    );
    if (liveRows.length > 0) {
      let latestYear: number | null = null;
      for (const r of liveRows as any[]) {
        const y = typeof r.jewish_year === "number" ? r.jewish_year : null;
        if (y == null) continue;
        if (latestYear == null || y > latestYear) latestYear = y;
      }
      const groupRows = latestYear
        ? liveRows.filter((r: any) => r.jewish_year === latestYear)
        : liveRows;
      return {
        comparableKey: liveComparableKey,
        parshaKey: (groupRows[0]?.parsha_key as string) ?? null,
        jewishYear: latestYear,
        rows: groupRows,
        isFallback: false,
      };
    }
  }
  const head = allRows[0] as any | undefined;
  if (!head) return { comparableKey: null, parshaKey: null, jewishYear: null, rows: [], isFallback: true };
  const fbKey = head.parsha_key as string;
  const fbYear = (head.jewish_year as number | null) ?? null;
  const fbRows = allRows.filter(
    (r: any) => r.parsha_key === fbKey && r.jewish_year === fbYear,
  );
  return {
    comparableKey: toParshaComparableKey(fbKey),
    parshaKey: fbKey,
    jewishYear: fbYear,
    rows: fbRows,
    isFallback: true,
  };
}

export const listPublishedPdfs = createServerFn({ method: "GET" })
  .inputValidator((input: { parshaKey: string }) =>
    z.object({ parshaKey: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const target = toParshaComparableKey(data.parshaKey);
    const allRows = await fetchAllPublishedRows(admin);
    const matched = allRows.filter(
      (r: any) => toParshaComparableKey(r.parsha_key) === target,
    );
    const resources = await buildResources(admin, matched);
    return { resources };
  });

// Homepage loader: returns live-parsha collection, or the most recent
// published collection as a fallback when the live parsha has no PDFs.
export const listHomepageWeek = createServerFn({ method: "GET" })
  .inputValidator((input: { parshaKey: string | null }) =>
    z.object({ parshaKey: z.string().min(1).max(120).nullable() }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const liveComparable = data.parshaKey ? toParshaComparableKey(data.parshaKey) : null;
    const displayed = await resolveDisplayedCollection(admin, liveComparable);
    const resources = await buildResources(admin, displayed.rows);
    return {
      resources,
      isFallback: displayed.isFallback,
      fallbackParshaKey: displayed.isFallback ? displayed.parshaKey : null,
    };
  });

// ---------- Public: publications meta (one entry per unique title) ----------
export type PublicationMeta = {
  title: string;
  primary_category: string | null;
  tags: string[];
  summary: string | null;
};

export const listPublicationsMeta = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ publications: PublicationMeta[] }> => {
    const admin = getSupabaseAdmin();
    const res = await admin
      .from("pdfs")
      .select("title, primary_category, tags, summary_quick, created_at")
      .eq("published", true)
      .order("created_at", { ascending: false });
    if (res.error) {
      console.error("listPublicationsMeta error", res.error);
      return { publications: [] };
    }
    const orderMap = await getTitleSortOrderMap(admin);
    const orderFor = (title: string): number => {
      const v = orderMap.get(title.trim().toLowerCase());
      return typeof v === "number" ? v : 999999;
    };
    const map = new Map<string, PublicationMeta>();
    for (const r of (res.data ?? []) as any[]) {
      const t = (r.title as string | null)?.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      const existing = map.get(key);
      const tags = Array.isArray(r.tags) ? (r.tags as string[]) : [];
      if (!existing) {
        map.set(key, {
          title: t,
          primary_category: (r.primary_category as string | null) ?? null,
          tags,
          summary: (r.summary_quick as string | null) ?? null,
        });
      } else {
        // Merge: prefer first non-null category/summary; union tags
        if (!existing.primary_category && r.primary_category)
          existing.primary_category = r.primary_category;
        if (!existing.summary && r.summary_quick)
          existing.summary = r.summary_quick;
        for (const tag of tags) {
          if (!existing.tags.includes(tag)) existing.tags.push(tag);
        }
      }
    }
    const publications = Array.from(map.values()).sort(
      (a, b) => orderFor(a.title) - orderFor(b.title),
    );
    return { publications };
  },
);

// ---------- Public: archive — all published PDFs grouped by year + parsha ----------
export type ArchivePdf = {
  id: string;
  title: string;
  publisher: string | null;
  subtitle: string | null;
  summary_quick: string | null;
  description: string | null;
  audience: string | null;
  format_type: string | null;
  page_count: number | null;
  badge: string | null;
};
export type ArchiveParsha = { parshaKey: string; pdfs: ArchivePdf[] };
export type ArchiveYear = { year: number; parshiyos: ArchiveParsha[] };
export type ArchiveResult = { years: ArchiveYear[] };

export const listArchive = createServerFn({ method: "GET" }).handler(
  async (): Promise<ArchiveResult> => {
    const admin = getSupabaseAdmin();
    const selectWith = "id, title, subtitle, summary_quick, parsha_key, jewish_year, created_at, description, audience, format_type, page_count, badge";
    const selectBase = "id, title, subtitle, summary_quick, parsha_key, jewish_year, created_at";
    let rows: any[] | null = null;
    const withMeta = await admin
      .from("pdfs")
      .select(selectWith)
      .eq("published", true)
      .order("jewish_year", { ascending: false })
      .order("created_at", { ascending: false });
    if (!withMeta.error) {
      rows = withMeta.data ?? [];
    } else {
      const fb = await admin
        .from("pdfs")
        .select(selectBase)
        .eq("published", true)
        .order("jewish_year", { ascending: false })
        .order("created_at", { ascending: false });
      if (fb.error) {
        console.error("listArchive error", fb.error);
        return { years: [] };
      }
      rows = fb.data ?? [];
    }
    const current = await resolveCurrentFeatured();
    const displayed = await resolveDisplayedCollection(admin, current.comparableKey);
    const orderMap = await getTitleSortOrderMap(admin);
    const canonical = await getCanonicalByPdfId(admin);
    const orderFor = (title: string): number => {
      const v = orderMap.get(title.trim().toLowerCase());
      return typeof v === "number" ? v : 999999;
    };
    const yearMap = new Map<
      number,
      Map<string, Array<ArchivePdf & { created_at: string }>>
    >();
    for (const r of rows ?? []) {
      const year = (r.jewish_year ?? 0) as number;
      if (!year) continue;
      // Exclude whichever collection the homepage is actually displaying
      // (live parsha, or fallback to most recent when live is empty).
      if (
        displayed.comparableKey &&
        displayed.jewishYear === year &&
        toParshaComparableKey(r.parsha_key) === displayed.comparableKey
      ) {
        continue;
      }
      if (!yearMap.has(year)) yearMap.set(year, new Map());
      const pmap = yearMap.get(year)!;
      if (!pmap.has(r.parsha_key)) pmap.set(r.parsha_key, []);
      pmap.get(r.parsha_key)!.push({
        id: r.id,
        title: canonical.get(r.id as string)?.name ?? r.title,
        publisher: canonical.get(r.id as string)?.publisher ?? null,
        subtitle: r.subtitle,
        summary_quick: r.summary_quick,
        description: (r.description as string | null) ?? null,
        audience: (r.audience as string | null) ?? null,
        format_type: (r.format_type as string | null) ?? null,
        page_count: typeof r.page_count === "number" ? r.page_count : null,
        badge: (r.badge as string | null) ?? null,
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
              pdfs: sortedPdfs.map(({ created_at: _c, ...rest }) => rest),
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
  description: string | null;
  audience: string | null;
  format_type: string | null;
  page_count: number | null;
  badge: string | null;
  publication: string | null;
  parsha_key: string | null;
};

export const getPdfById = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    // Try selecting the richest column set first (some columns may not exist in
    // all environments); fall back progressively to the base set.
    type PdfRow = {
      id: string;
      title: string;
      subtitle: string | null;
      file_path: string;
      published: boolean;
      created_at: string | null;
      week_of: string | null;
      updated_at?: string | null;
      description?: string | null;
      audience?: string | null;
      format_type?: string | null;
      page_count?: number | null;
      badge?: string | null;
      publication?: string | null;
      parsha_key?: string | null;
    };
    const selects = [
      "id, title, subtitle, file_path, published, created_at, week_of, updated_at, description, audience, format_type, page_count, badge, publication, parsha_key",
      "id, title, subtitle, file_path, published, created_at, week_of, updated_at",
      "id, title, subtitle, file_path, published, created_at, week_of",
    ];
    let row: PdfRow | null = null;
    let resolved = false;
    for (const select of selects) {
      const res = await admin
        .from("pdfs")
        .select(select)
        .eq("id", data.id)
        .maybeSingle();
      if (!res.error) {
        row = (res.data ?? null) as PdfRow | null;
        resolved = true;
        break;
      }
    }
    if (!resolved || !row || !row.published) {
      return { pdf: null as null | PublicPdf };
    }
    // Prefer the canonical publication name when the row is linked.
    let displayTitle = row.title;
    try {
      const link = await admin
        .from("pdfs")
        .select("publication_id")
        .eq("id", data.id)
        .maybeSingle();
      const pubId = (link.data as any)?.publication_id as string | null | undefined;
      if (pubId) {
        const pub = await admin
          .from("publications")
          .select("name")
          .eq("id", pubId)
          .maybeSingle();
        const name = (pub.data as any)?.name as string | undefined;
        if (name) displayTitle = name;
      }
    } catch {
      /* pre-migration: keep pdfs.title */
    }
    const { data: signed } = await admin.storage
      .from("pdfs")
      .createSignedUrl(row.file_path, 60 * 60);
    return {
      pdf: {
        id: row.id,
        title: displayTitle,
        subtitle: row.subtitle,
        url: signed?.signedUrl ?? "",
        createdAt: row.created_at ?? null,
        updatedAt: row.updated_at ?? null,
        weekOf: row.week_of ?? null,
        description: row.description ?? null,
        audience: row.audience ?? null,
        format_type: row.format_type ?? null,
        page_count: typeof row.page_count === "number" ? row.page_count : null,
        badge: row.badge ?? null,
        publication: row.publication ?? null,
        parsha_key: row.parsha_key ?? null,
      } as PublicPdf,
    };
  });


// ---------- Public: live current parsha (Hebcal truth, ignores override) ----------
// The admin Weekly Upload Checklist uses this so it always tracks the actual
// current week's parsha and rolls forward automatically when the week changes,
// even if a stale display-override exists in settings.
export const getLiveCurrentParsha = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const res = await fetch(
      "https://www.hebcal.com/shabbat?cfg=json&geonameid=5128581&M=on",
    );
    const data = (await res.json()) as {
      items?: Array<{ title: string; category: string; subcat?: string; date: string; hdate?: string }>;
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

    let parshaKey: string | null = null;
    let displayLabel = "Parshas Hashavua";
    if (yomTov) {
      parshaKey = hebcalYomTovToKey(yomTov.title) ?? yomTov.title;
      displayLabel = parshaKey;
    } else if (parsha) {
      parshaKey = hebcalToParshaKey(parsha.title);
      displayLabel = `Parshas ${parshaKey}`;
    }

    let jewishYear: number | null = null;
    const hdate = parsha?.hdate ?? items.find((i) => i.hdate)?.hdate;
    if (hdate) {
      const m = hdate.match(/(\d{4,5})\s*$/);
      if (m) jewishYear = Number(m[1]);
    }
    if (!jewishYear) {
      const d = new Date();
      const month = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      jewishYear =
        d.getUTCFullYear() + 3760 + (month > 9 || (month === 9 && day >= 15) ? 1 : 0);
    }

    return { parshaKey, displayLabel, jewishYear, shabbosDate: parsha?.date?.slice(0, 10) ?? null };
  } catch (e) {
    console.error("getLiveCurrentParsha error", e);
    return { parshaKey: null, displayLabel: "Parshas Hashavua", jewishYear: null, shabbosDate: null };
  }
});

// ---------- Public: read parsha override ----------
// Returns the raw saved override plus whether it is still active for the
// current Hebcal week. The homepage should only use `override` when
// `isActive` is true; the admin UI displays the raw value regardless so
// the admin can see (and clear) a stale override.
export const getParshaOverride = createServerFn({ method: "GET" }).handler(async () => {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("settings")
    .select("parsha_override, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("getParshaOverride error", error);
    return { override: null as string | null, isActive: false };
  }
  const override = (data?.parsha_override ?? null) as string | null;
  const updatedAt = (data?.updated_at ?? null) as string | null;
  if (!override) return { override: null, isActive: false };
  const shabbosDate = await fetchCurrentShabbosDate();
  const isActive = isOverrideCurrent(updatedAt, shabbosDate);
  return { override, isActive };
});

// ---------- Public: subscribe email (unsubscribe-aware reactivation) ----------
export const subscribeEmail = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; source?: string }) =>
    z
      .object({ email: z.string().email().max(254), source: z.string().max(64).optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const email = data.email.toLowerCase();
    const tag = `[subscribe:${email.slice(0, 2)}***@${email.split("@")[1] ?? "?"}]`;

    console.log(`${tag} start`);

    // Look up an existing row first so we can reactivate cleanly instead of
    // hitting a duplicate-key error or leaving an unsubscribed row inactive.
    const { data: existing } = await admin
      .from("subscribers")
      .select("id, active, unsubscribe_token")
      .eq("email", email)
      .maybeSingle();

    // Helper: convert a welcome-email result into the subscribe response.
    // Subscription save already succeeded by the time we call this, so we keep
    // the row in the DB but surface the email failure to the frontend.
    const respondFromWelcome = (r: WelcomeEmailResult) => {
      if (r.attempted === true && r.ok === true) {
        return { ok: true as const, error: null, welcomeEmailSent: true as const, alreadySubscribed: false as const };
      }
      return { ok: true as const, error: null, welcomeEmailSent: false as const, alreadySubscribed: false as const };
    };

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
        console.log(`${tag} reactivated -> sending welcome`);
        const r = await sendWelcomeEmailSafe(email, existing.unsubscribe_token ?? null);
        return respondFromWelcome(r);
      }
      console.log(`${tag} already active -> welcome skipped`);
      return { ok: true, error: null, welcomeEmailSent: false as const, alreadySubscribed: true as const };
    }

    let { error } = await admin.from("subscribers").insert({ email, source: data.source ?? null });
    // Older deployments may not have the optional `source` column — retry plainly.
    if (error && /source/i.test(error.message ?? "")) {
      ({ error } = await admin.from("subscribers").insert({ email }));
    }
    if (error) {
      if (error.message.toLowerCase().includes("duplicate")) {
        console.log(`${tag} duplicate race -> welcome skipped`);
        return { ok: true, error: null, welcomeEmailSent: false as const, alreadySubscribed: true as const };
      }
      console.error(`${tag} insert error`, error);
      return { ok: false, error: "Could not subscribe. Please try again." };
    }
    console.log(`${tag} new subscriber inserted`);

    // Fetch the unsubscribe_token that was generated by the DB default so we
    // can include a working unsubscribe link in the welcome email.
    const { data: fresh } = await admin
      .from("subscribers")
      .select("unsubscribe_token")
      .eq("email", email)
      .maybeSingle();
    const r = await sendWelcomeEmailSafe(email, fresh?.unsubscribe_token ?? null);
    return respondFromWelcome(r);
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
  const rawFromAddress = process.env.EMAIL_FROM_ADDRESS;
  const fromAddress = rawFromAddress ? rawFromAddress.trim().toLowerCase() : rawFromAddress;
  const missing: string[] = [];
  if (!apiKey) missing.push("RESEND_API_KEY");
  if (!fromAddress) missing.push("EMAIL_FROM_ADDRESS");
  if (missing.length > 0) {
    console.warn(`[welcome-email] skipped: missing env ${missing.join(",")}`);
    return { attempted: false, reason: "not_configured", missing };
  }
  const configuredApiKey = apiKey as string;
  const configuredFromAddress = fromAddress as string;
  

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
    "Expect a new email each week, usually Thursday or Friday, with that week's Parshas resources ready for your Shabbos table.",
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
    <p style="margin:0 0 14px;">Expect a new email each week, usually <strong>Thursday or Friday</strong>, with that week&rsquo;s Parshas resources ready for your Shabbos table.</p>
    <p style="margin:0 0 14px;color:#55575d;font-size:13px;">
      You can unsubscribe anytime using the link at the bottom of any email we send you${unsubscribeUrl ? `, or directly <a href="${unsubscribeUrl}" style="color:#5a3a1f;">here</a>` : ""}.
    </p>
    <p style="margin:24px 0 0;">&mdash; Torah for the Table<br><a href="${SITE_URL}/" style="color:#5a3a1f;">${SITE_URL}</a></p>
  </div>
</body></html>`;

  const headers: Record<string, string> = {};
  if (unsubscribeUrl) headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;

  try {
    const resendPayload = {
      from: configuredFromAddress,
      to: email,
      subject,
      html,
      text,
      ...(unsubscribeUrl ? { headers } : {}),
    };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${configuredApiKey}`,
      },
      body: JSON.stringify(resendPayload),
    });
    const rawResponseBody = await res.text().catch(() => "");
    if (!res.ok) {
      const errText = rawResponseBody.slice(0, 200);
      console.error(
        `[welcome-email] failed from=${configuredFromAddress} status=${res.status} error=${errText}`,
      );
      return { attempted: true, ok: false, status: res.status, errorSnippet: errText };
    }
    let messageId: string | undefined;
    try {
      const parsed = JSON.parse(rawResponseBody) as { id?: string };
      messageId = parsed?.id;
    } catch {
      // ignore parse errors
    }
    console.log(
      `[welcome-email] sent from=${configuredFromAddress} status=${res.status} id=${messageId ?? "n/a"}`,
    );
    return { attempted: true, ok: true, status: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[welcome-email] network error: ${msg}`);
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
  // The user signs in against the Lovable Cloud Supabase project, so validate
  // the token there (not the external "torah-by-the-table" project).
  const { createClient } = await import("@supabase/supabase-js");
  const cloudUrl = process.env.SUPABASE_URL;
  const cloudKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!cloudUrl || !cloudKey) throw new Error("Server misconfigured: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY missing");
  const cloud = createClient(cloudUrl, cloudKey, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: uErr } = await cloud.auth.getUser(accessToken);
  if (uErr || !userData?.user) throw new Error("Not authenticated");
  const email = (userData.user.email ?? "").toLowerCase();
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!email || !allow.includes(email)) throw new Error("Forbidden");
  return { userId: userData.user.id, email };
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
    const withSlot = await admin
      .from("pdfs")
      .select("id, parsha_key, title, subtitle, file_path, published, jewish_year, created_at, summary_quick, content_type, primary_category, tags, publication, description, audience, format_type, page_count, badge, featured_slot")
      .order("created_at", { ascending: false });
    if (!withSlot.error) return { pdfs: withSlot.data ?? [] };
    const withMeta = await admin
      .from("pdfs")
      .select("id, parsha_key, title, subtitle, file_path, published, jewish_year, created_at, summary_quick, content_type, primary_category, tags, publication, description, audience, format_type, page_count, badge")
      .order("created_at", { ascending: false });
    if (!withMeta.error) return { pdfs: withMeta.data ?? [] };
    const withPub = await admin
      .from("pdfs")
      .select("id, parsha_key, title, subtitle, file_path, published, jewish_year, created_at, summary_quick, content_type, primary_category, tags, publication")
      .order("created_at", { ascending: false });
    if (!withPub.error) return { pdfs: withPub.data ?? [] };
    const withCats = await admin
      .from("pdfs")
      .select("id, parsha_key, title, subtitle, file_path, published, jewish_year, created_at, summary_quick, content_type, primary_category, tags")
      .order("created_at", { ascending: false });
    if (!withCats.error) return { pdfs: withCats.data ?? [] };
    const fb = await admin
      .from("pdfs")
      .select("id, parsha_key, title, subtitle, file_path, published, jewish_year, created_at, summary_quick, content_type")
      .order("created_at", { ascending: false });
    if (fb.error) throw new Error(fb.error.message);
    return { pdfs: fb.data ?? [] };
  });

// ---------- Admin: generate/regenerate summary via external edge function ----------
export const adminGenerateSummary = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string().min(10), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const serviceKey =
      process.env.EXT_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return { ok: false as const, error: "Missing EXT_SUPABASE_SERVICE_ROLE_KEY" };
    }
    const url = "https://kwdeyzumetmjcvtbqnzl.supabase.co/functions/v1/generate-summary";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ id: data.id }),
        signal: controller.signal,
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        return { ok: false as const, error: `Non-JSON response (${res.status}): ${text.slice(0, 300)}` };
      }
      if (!res.ok || json?.error) {
        return { ok: false as const, error: json?.error ?? `Edge function error ${res.status}` };
      }
      const saved = json?.saved ?? {};
      return {
        ok: true as const,
        id: json?.id ?? data.id,
        summary_quick: (saved.summary_quick ?? null) as string | null,
        content_type: (saved.content_type ?? null) as string | null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      return { ok: false as const, error: msg };
    } finally {
      clearTimeout(timeout);
    }
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
    publicationId?: string | null;
    primaryCategory?: string | null;
    publication?: string | null;
    tags?: string[] | null;
    description?: string | null;
    audience?: string | null;
    formatType?: string | null;
    pageCount?: number | null;
    badge?: string | null;
    featuredSlot?: string | null;
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
        publicationId: z.string().uuid().nullable().optional(),
        primaryCategory: z.enum(["kids", "family", "in_depth", "reference"]).nullable().optional(),
        publication: z.enum(["tftt_original", "mikaamcha", "peninei_mechkerei"]).nullable().optional(),
        tags: z.array(z.string().min(1).max(60)).max(20).nullable().optional(),
        description: z.string().max(500).nullable().optional(),
        audience: z.enum(["Adults", "Families", "Children"]).nullable().optional(),
        formatType: z.enum(["Short Vorts", "Stories", "Halacha", "Essays"]).nullable().optional(),
        pageCount: z.number().int().min(0).max(10000).nullable().optional(),
        badge: z.enum(["Recommended", "Quick Read", "Kids' Pick"]).nullable().optional(),
        featuredSlot: z.enum(["children", "family", "quickest", "deeper"]).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { userId, email } = await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    let createdBy: string | null = null;
    try {
      const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const users = authUsers?.users ?? [];
      createdBy =
        users.find((u: any) => u.id === userId)?.id ??
        users.find((u: any) => ((u.email as string | undefined) ?? "").toLowerCase() === email)?.id ??
        null;
    } catch {
      createdBy = null;
    }

    // Universal duplicate guard: block if a PDF already exists for the same
    // parsha + jewish year + source/checklist placement (matched by normalized title).
    const incomingTitleKey = data.title.trim().replace(/\s+/g, " ").toLowerCase();
    const incomingParshaKey = toParshaComparableKey(data.parshaKey);
    const { data: existingRows, error: dupQueryErr } = await admin
      .from("pdfs")
      .select("id, parsha_key, title, jewish_year")
      .eq("jewish_year", data.jewishYear);
    if (dupQueryErr) throw new Error(`Duplicate check failed: ${dupQueryErr.message}`);
    const duplicate = (existingRows ?? []).find(
      (r: any) =>
        toParshaComparableKey(r.parsha_key as string) === incomingParshaKey &&
        ((r.title as string) ?? "").trim().replace(/\s+/g, " ").toLowerCase() ===
          incomingTitleKey,
    );
    if (duplicate) {
      throw new Error(
        "A file is already uploaded for this placement. Delete the existing one first if you want to replace it.",
      );
    }

    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${data.parshaKey.replace(/[^a-zA-Z0-9._-]/g, "_")}/${Date.now()}_${safeName}`;
    const buf = Buffer.from(data.fileBase64, "base64");
    const { error: upErr } = await admin.storage
      .from("pdfs")
      .upload(path, buf, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    const { publicationForTitle } = await import("@/lib/badges");
    const autoPublication = publicationForTitle(data.title);
    const insertRow: Record<string, unknown> = {
      parsha_key: data.parshaKey,
      title: data.title,
      subtitle: data.subtitle,
      file_path: path,
      published: data.published,
      jewish_year: data.jewishYear,
      created_by: createdBy,
    };
    if (data.publicationId) insertRow.publication_id = data.publicationId;
    if (data.primaryCategory) insertRow.primary_category = data.primaryCategory;
    const finalPublication = data.publication ?? autoPublication;
    if (finalPublication) insertRow.publication = finalPublication;
    if (data.tags && data.tags.length > 0) insertRow.tags = data.tags;
    if (data.description !== undefined && data.description !== null) insertRow.description = data.description;
    if (data.audience !== undefined && data.audience !== null) insertRow.audience = data.audience;
    if (data.formatType !== undefined && data.formatType !== null) insertRow.format_type = data.formatType;
    if (data.pageCount !== undefined && data.pageCount !== null) insertRow.page_count = data.pageCount;
    if (data.badge !== undefined && data.badge !== null) insertRow.badge = data.badge;
    if (data.featuredSlot !== undefined && data.featuredSlot !== null)
      insertRow.featured_slot = data.featuredSlot;

    const metaKeys = ["publication_id", "description", "audience", "format_type", "page_count", "badge", "featured_slot"] as const;
    const tryInsert = async (row: Record<string, unknown>) => (await admin.from("pdfs").insert(row)).error;
    let currentRow: Record<string, unknown> = { ...insertRow };
    let insErr = await tryInsert(currentRow);
    // If any metadata column is missing on the DB, retry stripping the offending column(s).
    while (insErr) {
      const offending = metaKeys.find((k) => new RegExp(`\\b${k}\\b`, "i").test(insErr!.message) && k in currentRow);
      if (!offending) break;
      delete currentRow[offending];
      insErr = await tryInsert(currentRow);
    }
    if (insErr && /publication/i.test(insErr.message)) {
      const { publication: _p, ...fallback } = currentRow as any;
      insErr = await tryInsert(fallback);
    }
    if (insErr) {
      await admin.storage.from("pdfs").remove([path]);
      throw new Error(`DB insert failed: ${insErr.message}`);
    }
    return { ok: true };
  });

// ---------- Admin: update PDF metadata (category, publication, tags, title/subtitle) ----------
export const adminUpdatePdfMeta = createServerFn({ method: "POST" })
  .inputValidator((input: {
    accessToken: string;
    id: string;
    title?: string;
    publicationId?: string | null;
    subtitle?: string | null;
    primaryCategory?: string | null;
    publication?: string | null;
    tags?: string[] | null;
    description?: string | null;
    audience?: string | null;
    formatType?: string | null;
    pageCount?: number | null;
    badge?: string | null;
    featuredSlot?: string | null;
    contentType?: string | null;
  }) =>
    z
      .object({
        accessToken: z.string().min(10),
        id: z.string().uuid(),
        title: z.string().min(1).max(300).optional(),
        publicationId: z.string().uuid().nullable().optional(),
        subtitle: z.string().max(500).nullable().optional(),
        primaryCategory: z.enum(["kids", "family", "in_depth", "reference"]).nullable().optional(),
        publication: z.enum(["tftt_original", "mikaamcha", "peninei_mechkerei"]).nullable().optional(),
        tags: z.array(z.string().min(1).max(60)).max(20).nullable().optional(),
        description: z.string().max(500).nullable().optional(),
        audience: z.enum(["Adults", "Families", "Children"]).nullable().optional(),
        formatType: z.enum(["Short Vorts", "Stories", "Halacha", "Essays"]).nullable().optional(),
        pageCount: z.number().int().min(0).max(10000).nullable().optional(),
        badge: z.enum(["Recommended", "Quick Read", "Kids' Pick"]).nullable().optional(),
        featuredSlot: z.enum(["children", "family", "quickest", "deeper"]).nullable().optional(),
        contentType: z
          .enum([
            "Questions & Answers",
            "Brief Insights",
            "Stories",
            "Parsha Essays",
            "Halacha",
            "In-Depth",
            "Mixed Collection",
          ])
          .nullable()
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const update: Record<string, unknown> = {};
    if (data.title !== undefined) update.title = data.title;
    if (data.publicationId !== undefined) update.publication_id = data.publicationId;
    if (data.subtitle !== undefined) update.subtitle = data.subtitle;
    if (data.primaryCategory !== undefined) update.primary_category = data.primaryCategory;
    if (data.publication !== undefined) update.publication = data.publication;
    if (data.tags !== undefined) update.tags = data.tags;
    if (data.description !== undefined) update.description = data.description;
    if (data.audience !== undefined) update.audience = data.audience;
    if (data.formatType !== undefined) update.format_type = data.formatType;
    if (data.pageCount !== undefined) update.page_count = data.pageCount;
    if (data.badge !== undefined) update.badge = data.badge;
    if (data.featuredSlot !== undefined) update.featured_slot = data.featuredSlot;
    if (data.contentType !== undefined) update.content_type = data.contentType;
    if (Object.keys(update).length === 0) return { ok: true };
    const metaKeys = ["publication_id", "description", "audience", "format_type", "page_count", "badge", "publication", "featured_slot"] as const;
    let current: Record<string, unknown> = { ...update };
    let { error } = await admin.from("pdfs").update(current).eq("id", data.id);
    while (error) {
      const offending = metaKeys.find((k) => new RegExp(`\\b${k}\\b`, "i").test(error!.message) && k in current);
      if (!offending) break;
      delete current[offending];
      if (Object.keys(current).length === 0) { error = null as any; break; }
      ({ error } = await admin.from("pdfs").update(current).eq("id", data.id));
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: replace PDF file on existing row ----------
export const adminReplacePdfFile = createServerFn({ method: "POST" })
  .inputValidator((input: {
    accessToken: string;
    id: string;
    fileName: string;
    fileBase64: string;
  }) =>
    z
      .object({
        accessToken: z.string().min(10),
        id: z.string().uuid(),
        fileName: z.string().min(1).max(255),
        fileBase64: z.string().min(10),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { data: row, error: rowErr } = await admin
      .from("pdfs")
      .select("id, parsha_key, file_path")
      .eq("id", data.id)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) throw new Error("PDF row not found");
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${row.parsha_key.replace(/[^a-zA-Z0-9._-]/g, "_")}/${Date.now()}_${safeName}`;
    const buf = Buffer.from(data.fileBase64, "base64");
    const { error: upErr } = await admin.storage
      .from("pdfs")
      .upload(path, buf, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    const { error: updErr } = await admin
      .from("pdfs")
      .update({ file_path: path })
      .eq("id", data.id);
    if (updErr) {
      await admin.storage.from("pdfs").remove([path]);
      throw new Error(`DB update failed: ${updErr.message}`);
    }
    if (row.file_path && row.file_path !== path) {
      await admin.storage.from("pdfs").remove([row.file_path]);
    }
    return { ok: true, file_path: path };
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

// ---------- Admin: bulk publish a set of PDFs ----------
export const adminBulkPublish = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; ids: string[] }) =>
    z
      .object({
        accessToken: z.string().min(10),
        ids: z.array(z.string().uuid()).min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("pdfs")
      .update({ published: true })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
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

// ---------- Admin: delete subscribers by id (single or bulk) ----------
export const adminDeleteSubscribers = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; ids: string[] }) =>
    z
      .object({
        accessToken: z.string().min(10),
        ids: z.array(z.string().uuid()).min(1).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { error, count } = await admin
      .from("subscribers")
      .delete({ count: "exact" })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, deleted: count ?? 0 };
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
    return { titleKeys: (rows ?? []).map((r: any) => r.title_key as string) };
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
  return { titles: (data ?? []).map((r: any) => r.title as string) };
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

// ---------- Public: read "What's New" banner ----------
export type WhatsNewBanner = {
  enabled: boolean;
  text: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
};

export const getWhatsNewBanner = createServerFn({ method: "GET" }).handler(
  async (): Promise<WhatsNewBanner> => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("whats_new_banner")
      .select("enabled, text, link_url, link_label")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      return { enabled: false, text: null, linkUrl: null, linkLabel: null };
    }
    return {
      enabled: Boolean(data.enabled),
      text: (data.text ?? null) as string | null,
      linkUrl: (data.link_url ?? null) as string | null,
      linkLabel: (data.link_label ?? null) as string | null,
    };
  },
);

// ---------- Admin: update "What's New" banner ----------
export const adminSetWhatsNewBanner = createServerFn({ method: "POST" })
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
      .from("whats_new_banner")
      .upsert({
        id: 1,
        enabled: data.enabled,
        text: data.text && data.text.length > 0 ? data.text : null,
        link_url: data.linkUrl && data.linkUrl.length > 0 ? data.linkUrl : null,
        link_label: data.linkLabel && data.linkLabel.length > 0 ? data.linkLabel : null,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Public: read "What's New" popup ----------
export type WhatsNewPopupItem = {
  title: string;
  description: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
};

export type WhatsNewPopup = {
  enabled: boolean;
  heading: string;
  items: WhatsNewPopupItem[];
  version: string;
};

export const getWhatsNewPopup = createServerFn({ method: "GET" }).handler(
  async (): Promise<WhatsNewPopup> => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("whats_new_popup")
      .select("enabled, heading, items, version")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      return { enabled: false, heading: "What's New", items: [], version: "0" };
    }
    const rawItems = Array.isArray(data.items) ? (data.items as any[]) : [];
    const items: WhatsNewPopupItem[] = rawItems
      .filter((i) => i && typeof i.title === "string" && i.title.trim())
      .slice(0, 4)
      .map((i) => ({
        title: String(i.title),
        description: i.description ? String(i.description) : null,
        linkUrl: i.linkUrl ? String(i.linkUrl) : null,
        linkLabel: i.linkLabel ? String(i.linkLabel) : null,
      }));
    return {
      enabled: Boolean(data.enabled),
      heading: (data.heading as string | null) ?? "What's New",
      items,
      version: (data.version as string | null) ?? "0",
    };
  },
);

// ---------- Admin: update "What's New" popup ----------
const whatsNewPopupItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  linkUrl: z
    .string()
    .trim()
    .max(500)
    .url()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null))
    .transform((v) => (v && v.length > 0 ? v : null)),
  linkLabel: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export const adminSetWhatsNewPopup = createServerFn({ method: "POST" })
  .inputValidator((input: {
    accessToken: string;
    enabled: boolean;
    heading: string;
    items: Array<{
      title: string;
      description?: string | null;
      linkUrl?: string | null;
      linkLabel?: string | null;
    }>;
    version?: string | null;
  }) =>
    z
      .object({
        accessToken: z.string().min(10),
        enabled: z.boolean(),
        heading: z.string().trim().min(1).max(200),
        items: z.array(whatsNewPopupItemSchema).max(4),
        version: z.string().trim().max(64).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();

    // Read current row to decide whether to bump version.
    const { data: existing } = await admin
      .from("whats_new_popup")
      .select("heading, items, version, enabled")
      .eq("id", 1)
      .maybeSingle();

    const newContentSig = JSON.stringify({
      heading: data.heading,
      items: data.items,
    });
    const oldContentSig = existing
      ? JSON.stringify({
          heading: (existing.heading as string | null) ?? "What's New",
          items: Array.isArray(existing.items) ? existing.items : [],
        })
      : null;

    let version = (existing?.version as string | null) ?? "1";
    if (data.version && data.version.length > 0) {
      version = data.version;
    } else if (!existing || oldContentSig !== newContentSig) {
      version = String(Date.now());
    }

    const { error } = await admin
      .from("whats_new_popup")
      .upsert({
        id: 1,
        enabled: data.enabled,
        heading: data.heading,
        items: data.items,
        version,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return { ok: true, version };
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
  let shabbosDate: string | null = null;

  // Hebcal first.
  try {
    const res = await fetch("https://www.hebcal.com/shabbat?cfg=json&geonameid=5128581&M=on");
    const data = (await res.json()) as {
      items?: Array<{ title: string; category: string; subcat?: string; date: string }>;
    };
    const items = data?.items ?? [];
    const parsha = items.find((i) => i.category === "parashat");
    shabbosDate = parsha?.date?.slice(0, 10) ?? null;
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

  // Override only wins if it was set during this Hebcal week.
  const activeOverride = await readActiveParshaOverride(admin, shabbosDate);
  if (activeOverride) rawKey = activeOverride;

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
    (r: any) => toParshaComparableKey(r.parsha_key) === target,
  );
  const orderMap = await getTitleSortOrderMap(admin);
  const orderFor = (t: string) => {
    const v = orderMap.get(t.trim().toLowerCase());
    return typeof v === "number" ? v : 999999;
  };
  matched.sort((a: any, b: any) => orderFor(a.title) - orderFor(b.title));
  const resources: WeeklyEmailResource[] = matched.map((r: any) => ({
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
    const rawFromAddress = process.env.EMAIL_FROM_ADDRESS;
    const fromAddress = rawFromAddress ? rawFromAddress.trim().toLowerCase() : rawFromAddress;
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
      (s: any) => typeof s.email === "string" && typeof s.unsubscribe_token === "string",
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

// ---------- Admin: list PDFs missing summary audio ----------
export const adminListPdfsMissingAudio = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { data: rows, error } = await admin
      .from("pdfs")
      .select("id, title")
      .is("summary_audio_path", null)
      .not("summary_quick", "is", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as Array<{ id: string; title: string }> };
  });

// ---------- Admin: generate summary audio for one row ----------
export const adminGenerateAudio = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string().min(10), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const serviceKey =
      process.env.EXT_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return { ok: false as const, id: data.id, error: "Missing EXT_SUPABASE_SERVICE_ROLE_KEY" };
    }
    const url = "https://kwdeyzumetmjcvtbqnzl.supabase.co/functions/v1/generate-audio";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ id: data.id }),
        signal: controller.signal,
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        return { ok: false as const, id: data.id, error: `Non-JSON response (${res.status}): ${text.slice(0, 300)}` };
      }
      if (!res.ok || json?.error) {
        return { ok: false as const, id: data.id, error: json?.error ?? `Edge function error ${res.status}` };
      }
      return {
        ok: true as const,
        id: data.id,
        summary_audio_path: (json?.summary_audio_path ?? json?.saved?.summary_audio_path ?? null) as string | null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      return { ok: false as const, id: data.id, error: msg };
    } finally {
      clearTimeout(timeout);
    }
  });

// ---------- Admin: generate publication metadata (description/audience/type + page_count) ----------
// Uses Lovable AI Gateway directly (no external edge function needed).
export const adminGeneratePublicationMeta = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string().min(10), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, id: data.id, error: "Missing LOVABLE_API_KEY" };
    }
    const admin = getSupabaseAdmin();
    const { data: row, error: rowErr } = await admin
      .from("pdfs")
      .select("id, title, subtitle, file_path, page_count")
      .eq("id", data.id)
      .maybeSingle();
    if (rowErr || !row) {
      return { ok: false as const, id: data.id, error: rowErr?.message ?? "row not found" };
    }
    if (!row.file_path) {
      return { ok: false as const, id: data.id, error: "row has no file_path" };
    }
    const { data: blob, error: dlErr } = await admin.storage.from("pdfs").download(row.file_path);
    if (dlErr || !blob) {
      return { ok: false as const, id: data.id, error: `download failed: ${dlErr?.message ?? "unknown"}` };
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // Detect page count from PDF bytes (only overwrites if currently unset).
    let detectedPageCount: number | null = null;
    try {
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
      detectedPageCount = doc.getPageCount();
    } catch {
      detectedPageCount = null;
    }

    // Base64-encode the PDF for the AI request.
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const b64 = btoa(binary);

    const systemPrompt = `You classify Torah publications for a weekly divrei-torah site.
Respond ONLY with a JSON object with exactly these keys:
{
  "description": string,      // one short sentence (max 200 chars) describing this publication's style/content
  "audience": string,          // exactly one of: "Adults", "Families", "Children"
  "format_type": string        // exactly one of: "Short Vorts", "Stories", "Halacha", "Essays"
}
Choose the single best value for audience and format_type. No prose, no code fences.`;
    const userPrompt = `Publication title: ${row.title}${row.subtitle ? ` — ${row.subtitle}` : ""}
Analyze the attached PDF and return the json object described in the system prompt.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    let aiRes: Response;
    try {
      aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "file",
                  file: {
                    filename: "publication.pdf",
                    file_data: `data:application/pdf;base64,${b64}`,
                  },
                },
                { type: "text", text: userPrompt },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeout);
      return {
        ok: false as const,
        id: data.id,
        error: e instanceof Error ? e.message : "AI request failed",
      };
    }
    clearTimeout(timeout);
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      return {
        ok: false as const,
        id: data.id,
        error: `AI error ${aiRes.status}: ${t.slice(0, 300)}`,
      };
    }
    const aiJson: any = await aiRes.json().catch(() => null);
    const text: string = aiJson?.choices?.[0]?.message?.content ?? "";
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
    let parsed: { description?: unknown; audience?: unknown; format_type?: unknown };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        ok: false as const,
        id: data.id,
        error: `AI response not JSON: ${text.slice(0, 200)}`,
      };
    }

    const audienceAllowed = ["Adults", "Families", "Children"];
    const formatAllowed = ["Short Vorts", "Stories", "Halacha", "Essays"];
    const description =
      typeof parsed.description === "string" && parsed.description.trim().length > 0
        ? parsed.description.trim().slice(0, 500)
        : null;
    const audience =
      typeof parsed.audience === "string" && audienceAllowed.includes(parsed.audience)
        ? (parsed.audience as string)
        : null;
    const format_type =
      typeof parsed.format_type === "string" && formatAllowed.includes(parsed.format_type)
        ? (parsed.format_type as string)
        : null;

    const update: Record<string, unknown> = {};
    if (description) update.description = description;
    if (audience) update.audience = audience;
    if (format_type) update.format_type = format_type;
    // Auto-detect page_count only when not already set.
    if (detectedPageCount != null && (row.page_count == null || row.page_count === 0)) {
      update.page_count = detectedPageCount;
    }

    if (Object.keys(update).length > 0) {
      const { error: upErr } = await admin.from("pdfs").update(update).eq("id", data.id);
      if (upErr) {
        return { ok: false as const, id: data.id, error: upErr.message };
      }
    }

    return {
      ok: true as const,
      id: data.id,
      description,
      audience,
      format_type,
      page_count:
        row.page_count != null && row.page_count !== 0 ? row.page_count : detectedPageCount,
    };
  });

// ---------- Admin: list PDFs missing description ----------
export const adminListPdfsMissingDescription = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { data: rows, error } = await admin
      .from("pdfs")
      .select("id, title")
      .or("description.is.null,audience.is.null,page_count.is.null")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as Array<{ id: string; title: string }> };
  });

// ---------- Admin: download analytics ----------
export const adminDownloadStats = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; days?: number }) =>
    z
      .object({ accessToken: z.string().min(10), days: z.number().int().min(1).max(365).optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const days = data.days ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await admin
      .from("download_events")
      .select("created_at, publication_id, publication_title, city, region, country")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20000);
    if (error) throw new Error(error.message);

    const events = (rows ?? []) as Array<{
      created_at: string;
      publication_id: string | null;
      publication_title: string | null;
      city: string | null;
      region: string | null;
      country: string | null;
    }>;

    const byDayMap = new Map<string, number>();
    const byPdfMap = new Map<
      string,
      { id: string | null; title: string; count: number; last: string; lastWho: string | null }
    >();

    const whoOf = (e: { city: string | null; region: string | null; country: string | null }) => {
      const parts = [e.city, e.region, e.country].filter(Boolean) as string[];
      return parts.length ? parts.join(", ") : null;
    };

    for (const e of events) {
      const day = new Date(e.created_at).toISOString().slice(0, 10);
      byDayMap.set(day, (byDayMap.get(day) ?? 0) + 1);

      const title = e.publication_title || "(untitled)";
      const key = e.publication_id || `title:${title}`;
      const cur = byPdfMap.get(key);
      if (cur) {
        cur.count += 1;
        if (e.created_at > cur.last) {
          cur.last = e.created_at;
          cur.lastWho = whoOf(e);
        }
      } else {
        byPdfMap.set(key, {
          id: e.publication_id,
          title,
          count: 1,
          last: e.created_at,
          lastWho: whoOf(e),
        });
      }
    }

    const byDay = Array.from(byDayMap.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => (a.day < b.day ? 1 : -1));
    const byPdf = Array.from(byPdfMap.values()).map((p) => ({
      ...p,
      key: p.id || `title:${p.title}`,
    })).sort((a, b) => b.count - a.count);

    const eventList = events.slice(0, 5000).map((e) => ({
      key: e.publication_id || `title:${e.publication_title || "(untitled)"}`,
      at: e.created_at,
      who: whoOf(e),
    }));

    return { days, total: events.length, byDay, byPdf, events: eventList };
  });

// ---------- GA4 summary (admin) ----------
export const adminGa4Summary = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; startDate: string; endDate: string }) =>
    z
      .object({
        accessToken: z.string().min(10),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const { getGa4Summary } = await import("@/lib/ga4.server");
    return await getGa4Summary(data.startDate, data.endDate);
  });
