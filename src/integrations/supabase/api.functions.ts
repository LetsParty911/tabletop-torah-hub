import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getSupabaseAdmin, getSupabaseForUser } from "@/integrations/supabase/ext.server";
import { toParshaComparableKey } from "@/lib/parsha-normalize";
import { hebcalToParshaKey, hebcalYomTovToKey } from "@/lib/parshiyos";
import { fetchHebcalShabbat } from "@/lib/hebcal";
import { standardizeCopy } from "@/lib/standardize-copy";
import { purgePdfEdgeCache, warmPdfEdgeCache } from "@/lib/pdf-edge-cache";
import { checkRateLimit } from "@/lib/rate-limit.server";

// Recompresses safe embedded JPEGs (grayscale/RGB, never CMYK) via MozJPEG
// and losslessly repacks the file's internal structure. See
// src/lib/pdf-image-optimize.server.ts for the full safety rules (SMask
// protection, component-count detection from the JPEG bitstream itself,
// minimum size/savings thresholds). Always falls back to the original bytes
// on any failure, so this can never make an upload fail or grow.
async function optimizePdfForStorage(buf: Buffer): Promise<Buffer> {
  const { optimizePdfImages } = await import("@/lib/pdf-image-optimize.server");
  return optimizePdfImages(buf);
}

// Normalize a publication/source title so small punctuation or spacing
// differences ("R' Yehuda" vs "R'Yehuda") still match the admin-set order.
export function sortTitleKey(title: string | null | undefined): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9]+/g, "");
}

// Build a map of normalized title -> sort_order.
// checklist_sources is the admin-managed weekly order and wins; publications
// sort_order is used as a fallback for titles not present in the checklist.
// Unknown titles should be sorted last by callers.
async function getTitleSortOrderMap(
  admin: ReturnType<typeof getSupabaseAdmin>,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const pubs = await admin.from("publications").select("name, sort_order");
    for (const row of pubs.data ?? []) {
      const t = sortTitleKey(row.name as string | null);
      const v = row.sort_order as number | null;
      if (t && typeof v === "number") map.set(t, v);
    }
  } catch {
    /* publications table may not exist yet */
  }
  try {
    const { data, error } = await admin
      .from("checklist_sources")
      .select("title, sort_order");
    if (error) {
      console.error("getTitleSortOrderMap error", error);
      return map;
    }
    for (const row of data ?? []) {
      const t = sortTitleKey(row.title as string | null);
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
  default_description?: string | null;
  sort_order: number;
  active: boolean;
};

// Public list of canonical publications (empty before the migration runs).
export const listCanonicalPublications = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ publications: CanonicalPublication[] }> => {
    const admin = getSupabaseAdmin();
    const baseCols =
      "id, name, publisher, default_audience, default_format_type, sort_order, active";
    try {
      const withDesc = await admin
        .from("publications")
        .select(`${baseCols}, default_description`)
        .order("name", { ascending: true });
      if (!withDesc.error) {
        return { publications: (withDesc.data ?? []) as CanonicalPublication[] };
      }
      const { data, error } = await admin
        .from("publications")
        .select(baseCols)
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
    const items = await fetchHebcalShabbat();
    const parsha = items.find((i) => i.category === "parashat");
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
    const items = await fetchHebcalShabbat();
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
    const v = orderMap.get(sortTitleKey(title));
    return typeof v === "number" ? v : 999999;
  };
  const sorted = [...rows].sort((a, b) => {
    const d = orderFor(displayTitle(a)) - orderFor(displayTitle(b));
    if (d !== 0) return d;
    return displayTitle(a).localeCompare(displayTitle(b));
  });

  return Promise.all(
    sorted.map(async (r: any) => {
      const { data: signed } = await admin.storage
        .from("pdfs")
        .createSignedUrl(r.file_path, 60 * 60);
      return {
        id: r.id,
        title: displayTitle(r),
        publisher: canonical.get(r.id as string)?.publisher ?? null,
        subtitle: standardizeCopy(r.subtitle),
        url: signed?.signedUrl ?? "#",
        summary_quick: r.summary_quick,
        content_type: r.content_type,
        summary_audio_path: r.summary_audio_path ?? null,
        primary_category: (r.primary_category as string | null) ?? null,
        publication: (r.publication as string | null) ?? null,
        tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
        description: standardizeCopy((r.description as string | null) ?? null),
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
      const v = orderMap.get(sortTitleKey(title));
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
  publication: string | null;
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
    const selectWith = "id, title, subtitle, summary_quick, parsha_key, jewish_year, created_at, description, audience, format_type, page_count, badge, publication";
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
      const v = orderMap.get(sortTitleKey(title));
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
        publication:
          canonical.get(r.id as string)?.name ??
          ((r.publication as string | null) ?? null),
        subtitle: standardizeCopy(r.subtitle),
        summary_quick: r.summary_quick,
        description: standardizeCopy((r.description as string | null) ?? null),
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
  publisher: string | null;
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
  thumb_url: string | null;
};

// First-page preview images live in the public `pdf-thumbs` bucket, keyed by
// the pdfs row id. No DB column is needed — the path is deterministic and the
// UI falls back to a text panel when the object is missing.
export function pdfThumbUrl(id: string): string | null {
  const base = process.env.EXT_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/pdf-thumbs/${id}.png`;
}

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
    // Ladder degrades one optional column group at a time so a single missing
    // legacy column can't drop parsha_key/description from the response.
    // NOTE: updated_at does not exist on this table; keep it out of the base set.
    const selects = [
      "id, title, subtitle, file_path, published, created_at, week_of, description, audience, format_type, page_count, badge, publication, parsha_key",
      "id, title, subtitle, file_path, published, created_at, week_of, description, audience, format_type, page_count, badge, parsha_key",
      "id, title, subtitle, file_path, published, created_at, week_of, description, parsha_key",
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
    let publisher: string | null = null;
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
          .select("name, publisher")
          .eq("id", pubId)
          .maybeSingle();
        const name = (pub.data as any)?.name as string | undefined;
        if (name) displayTitle = name;
        publisher = ((pub.data as any)?.publisher as string | null) ?? null;
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
        publisher,
        subtitle: standardizeCopy(row.subtitle),

        url: signed?.signedUrl ?? "",
        createdAt: row.created_at ?? null,
        updatedAt: row.updated_at ?? null,
        weekOf: row.week_of ?? null,
        description: standardizeCopy(row.description ?? null),
        audience: row.audience ?? null,
        format_type: row.format_type ?? null,
        page_count: typeof row.page_count === "number" ? row.page_count : null,
        badge: row.badge ?? null,
        publication: row.publication ?? null,
        parsha_key: row.parsha_key ?? null,
        thumb_url: pdfThumbUrl(row.id),
      } as PublicPdf,
    };
  });


// ---------- Public: live current parsha (Hebcal truth, ignores override) ----------
// The admin Weekly Upload Checklist uses this so it always tracks the actual
// current week's parsha and rolls forward automatically when the week changes,
// even if a stale display-override exists in settings.
export const getLiveCurrentParsha = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const items = await fetchHebcalShabbat();
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
  .inputValidator((input: { email: string; source?: string; consent?: boolean }) =>
    z
      .object({
        email: z.string().trim().email().max(254),
        source: z.string().max(64).optional(),
        consent: z.literal(true, { message: "Consent is required." }),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await checkRateLimit(getRequest(), "subscribe"))) {
      return { ok: false as const, error: "Too many requests. Please try again in a minute." };
    }
    const admin = getSupabaseAdmin();
    const email = data.email.toLowerCase();
    const tag = `[subscribe:${email.slice(0, 2)}***@${email.split("@")[1] ?? "?"}]`;

    console.log(`${tag} start`);

    // 1) Sender.net is the source of truth for the mailing list and owns the
    //    welcome-email automation. If it fails we must not claim success.
    const { addSubscriberToSenderGroup } = await import("@/lib/sender.server");
    const sender = await addSubscriberToSenderGroup(email);
    if (!sender.ok) {
      console.error(`${tag} sender sync failed`, sender.reason, sender.status ?? "");
      return {
        ok: false as const,
        error: "We couldn't complete your subscription right now. Please try again.",
      };
    }

    // 2) Mirror locally (best effort — never fails the visitor's signup).
    const { data: existing } = await admin
      .from("subscribers")
      .select("id, active")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      if (!existing.active) {
        await admin
          .from("subscribers")
          .update({ active: true, unsubscribed_at: null })
          .eq("id", existing.id);
      }
    } else {
      let { error } = await admin.from("subscribers").insert({ email, source: data.source ?? null });
      if (error && /source/i.test(error.message ?? "")) {
        ({ error } = await admin.from("subscribers").insert({ email }));
      }
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        console.error(`${tag} local mirror insert error`, error);
      }
    }

    console.log(`${tag} synced to Sender.net (already=${sender.alreadySubscribed})`);
    return {
      ok: true as const,
      error: null,
      welcomeEmailSent: false as const,
      alreadySubscribed: sender.alreadySubscribed,
    };
  });


// ---------- Public: active subscriber count ----------
export const getActiveSubscriberCount = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ count: number }> => {
    try {
      const admin = getSupabaseAdmin();
      const { count } = await admin
        .from("subscribers")
        .select("id", { count: "exact", head: true })
        .eq("active", true);
      return { count: count ?? 0 };
    } catch (e) {
      console.error("getActiveSubscriberCount error", e);
      return { count: 0 };
    }
  },
);

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
    if (!(await checkRateLimit(getRequest(), "contact"))) {
      return { ok: false, error: "Too many requests. Please try again in a minute." };
    }
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
// This is the ONLY authorization boundary for every admin-only action in
// this file - every server function uses the service-role Supabase client,
// which bypasses Row-Level Security entirely, so RLS is never a live
// enforcement layer here. (There is a separate, unused has_role()/
// user_roles/RLS-policy system defined in supabase_migration.sql from an
// earlier design - it is not read by this function or by anything else in
// the app. Do not assume it is what's gating admin access.)
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
    // Prefer the canonical FK (publication_id) when the column exists; every
    // select below is a graceful fallback for older schemas.
    const withFk = await admin
      .from("pdfs")
      .select("id, parsha_key, title, subtitle, file_path, published, jewish_year, created_at, summary_quick, content_type, primary_category, tags, publication, publication_id, description, audience, format_type, page_count, badge, featured_slot")
      .order("created_at", { ascending: false });
    if (!withFk.error) return { pdfs: withFk.data ?? [] };
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
    const extBase = process.env.EXT_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!extBase) {
      return { ok: false as const, error: "Missing EXT_SUPABASE_URL" };
    }
    const url = `${extBase.replace(/\/$/, "")}/functions/v1/generate-summary`;
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
    // Store the raw upload immediately — recompression is CPU-heavy (MozJPEG)
    // and running it inline here risked exceeding the Worker's per-request
    // CPU time limit on larger/image-heavy PDFs, which killed the connection
    // outright ("Failed to fetch") rather than failing gracefully. The client
    // triggers adminRecompressExistingPdf as a best-effort follow-up call
    // right after upload succeeds, so compression still happens automatically
    // but no longer blocks (or risks) the upload response.
    const buf = Buffer.from(data.fileBase64, "base64");
    const { error: upErr } = await admin.storage
      .from("pdfs")
      .upload(path, buf, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    const { publicationForTitle } = await import("@/lib/badges");
    const autoPublication = publicationForTitle(data.title);
    const newId = crypto.randomUUID();
    const insertRow: Record<string, unknown> = {
      id: newId,
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
    // Page count is always derived from the uploaded PDF itself.
    let derivedPageCount: number | null = null;
    try {
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(new Uint8Array(buf), {
        updateMetadata: false,
        ignoreEncryption: true,
      });
      derivedPageCount = doc.getPageCount();
    } catch {
      derivedPageCount = null;
    }
    const finalPageCount = derivedPageCount ?? data.pageCount ?? null;
    if (finalPageCount !== null) insertRow.page_count = finalPageCount;
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
    if (data.published) warmPdfEdgeCache(newId);
    return { ok: true, id: newId };
  });

// ---------- Admin: store first-page thumbnail for a PDF row ----------
// The image is rendered in the admin browser (pdf.js) and stored in the public
// `pdf-thumbs` bucket as `<pdf id>.png`, overwriting any previous preview.
export const adminUploadPdfThumb = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; id: string; pngBase64: string }) =>
    z
      .object({
        accessToken: z.string().min(10),
        id: z.string().uuid(),
        pngBase64: z.string().min(10),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const buf = Buffer.from(data.pngBase64, "base64");
    const { error } = await admin.storage
      .from("pdf-thumbs")
      .upload(`${data.id}.png`, buf, { contentType: "image/png", upsert: true });
    if (error) {
      console.error("adminUploadPdfThumb error", error);
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
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
      .select("id, parsha_key, file_path, published")
      .eq("id", data.id)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) throw new Error("PDF row not found");
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${row.parsha_key.replace(/[^a-zA-Z0-9._-]/g, "_")}/${Date.now()}_${safeName}`;
    // See adminUploadPdf: recompression is deferred to a follow-up
    // adminRecompressExistingPdf call rather than run inline here.
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
    await purgePdfEdgeCache(data.id);
    if (row.published) warmPdfEdgeCache(data.id);
    return { ok: true, file_path: path };
  });

// ---------- Admin: backfill compression on an already-uploaded PDF ----------
// For files uploaded before the JPEG recompression pipeline existed (or
// uploaded/replaced while it was briefly reverted). Downloads the current
// stored file, runs it through the exact same optimizePdfForStorage used at
// upload time, and only replaces the stored copy if the result is
// genuinely smaller. Deliberately a single-file, manually-triggered action
// (not a bulk "recompress everything" job) so each result can be reviewed
// before trusting it more broadly - see optimizePdfForStorage / the
// underlying optimizePdfImages for the full safety rules (CMYK/SMask
// skipped, minimum size/savings thresholds, per-image failure isolation).
export const adminRecompressExistingPdf = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string().min(10), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { data: row, error: rowErr } = await admin
      .from("pdfs")
      .select("id, parsha_key, file_path, published, title")
      .eq("id", data.id)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) throw new Error("PDF row not found");
    if (!row.file_path) throw new Error("Row has no file_path");

    const { data: blob, error: dlErr } = await admin.storage.from("pdfs").download(row.file_path);
    if (dlErr || !blob) {
      throw new Error(`Download failed: ${dlErr?.message ?? "unknown"}`);
    }
    const originalBuf = Buffer.from(await blob.arrayBuffer());
    const optimizedBuf = await optimizePdfForStorage(originalBuf);

    // A trivial byte-level reduction (e.g. a few hundred bytes purely from
    // the incidental lossless structural repack, with no real image
    // recompression happening underneath) isn't worth a full storage
    // swap + cache purge/warm cycle, and reporting it as "Shrunk" would be
    // misleading when it rounds to 0% smaller. Only proceed if the file is
    // meaningfully smaller - this is what actually tells us whether real
    // JPEG recompression found anything eligible (vs. e.g. all-CMYK images,
    // which this pipeline deliberately never touches).
    const MIN_WHOLE_FILE_SAVINGS_RATIO = 0.03;
    const meaningfullySmaller =
      optimizedBuf.length <= originalBuf.length * (1 - MIN_WHOLE_FILE_SAVINGS_RATIO);
    if (!meaningfullySmaller) {
      return {
        ok: true as const,
        changed: false as const,
        originalBytes: originalBuf.length,
        newBytes: originalBuf.length,
      };
    }

    const safeName = (row.file_path.split("/").pop() || "file.pdf").replace(
      /^\d{10,}_/,
      "",
    );
    const path = `${row.parsha_key.replace(/[^a-zA-Z0-9._-]/g, "_")}/${Date.now()}_${safeName}`;
    const { error: upErr } = await admin.storage
      .from("pdfs")
      .upload(path, optimizedBuf, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    const { error: updErr } = await admin.from("pdfs").update({ file_path: path }).eq("id", data.id);
    if (updErr) {
      await admin.storage.from("pdfs").remove([path]);
      throw new Error(`DB update failed: ${updErr.message}`);
    }
    await admin.storage.from("pdfs").remove([row.file_path]);
    await purgePdfEdgeCache(data.id);
    if (row.published) warmPdfEdgeCache(data.id);
    return {
      ok: true as const,
      changed: true as const,
      originalBytes: originalBuf.length,
      newBytes: optimizedBuf.length,
    };
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
    if (!data.published) {
      // A cached "published" response must not keep being served after
      // an admin deliberately pulls a PDF.
      await purgePdfEdgeCache(data.id);
    } else {
      // Warm the edge cache the moment a PDF goes live, so the first real
      // reader in each region gets an instant hit instead of paying the
      // cold lookup+storage-read cost themselves.
      warmPdfEdgeCache(data.id);
    }
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
    for (const id of data.ids) warmPdfEdgeCache(id);
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
    await purgePdfEdgeCache(data.id);
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
    const withFk = await admin
      .from("checklist_sources")
      .select("id, title, active, sort_order, created_at, publication_id")
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });
    if (!withFk.error) return { sources: withFk.data ?? [] };
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

// ---------- Public: read Thursday progress meter ----------
export type ThursdayProgress = {
  fillStep: 0 | 25 | 50 | 75 | 95 | 100;
  eta: string | null;
};

export const getThursdayProgress = createServerFn({ method: "GET" }).handler(
  async (): Promise<ThursdayProgress> => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("settings")
      .select("progress_fill_step, progress_eta")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      return { fillStep: 25, eta: null };
    }
    const rawStep = Number(data.progress_fill_step);
    const fillStep = ([0, 25, 50, 75, 95, 100] as const).includes(rawStep as any)
      ? (rawStep as 0 | 25 | 50 | 75 | 95 | 100)
      : 25;
    return {
      fillStep,
      eta: (data.progress_eta ?? null) as string | null,
    };
  },
);

// ---------- Admin: update Thursday progress meter ----------
export const adminSetThursdayProgress = createServerFn({ method: "POST" })
  .inputValidator((input: {
    accessToken: string;
    fillStep: 0 | 25 | 50 | 75 | 95 | 100;
    eta: string | null;
  }) =>
    z
      .object({
        accessToken: z.string().min(10),
        fillStep: z.union([
          z.literal(0),
          z.literal(25),
          z.literal(50),
          z.literal(75),
          z.literal(95),
          z.literal(100),
        ]),
        eta: z.string().trim().datetime({ offset: true }).nullable()
          .or(z.literal("").transform(() => null)),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("settings")
      .update({
        progress_fill_step: data.fillStep,
        progress_eta: data.eta,
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
    const items = await fetchHebcalShabbat();
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
    const v = orderMap.get(sortTitleKey(t));
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

    // Claim this week's send atomically BEFORE emailing anyone. The unique
    // constraint on (parsha_key, jewish_year) means a genuine concurrent
    // second attempt (e.g. a double-tap on a slow connection, or two tabs)
    // fails right here and never reaches the send loop below - closing the
    // race where two invocations could otherwise both read "not yet sent"
    // above and both email every subscriber.
    const { data: claimRow, error: claimErr } = await admin
      .from("weekly_email_sends")
      .insert({
        parsha_key: content.parshaKey,
        jewish_year: content.jewishYear,
        subject: content.subject,
        sent_count: 0,
        created_by: userId,
        provider: "resend",
      })
      .select("id")
      .single();
    if (claimErr) {
      if (/duplicate key|unique constraint/i.test(claimErr.message)) {
        return { ok: false, error: "This week's email has already been sent." };
      }
      return { ok: false, error: `Could not start send: ${claimErr.message}` };
    }
    const claimId = claimRow.id as string;

    // Pull active subscribers (email + token) for personalized unsubscribe links.
    const { data: subs, error: subsErr } = await admin
      .from("subscribers")
      .select("email, unsubscribe_token")
      .eq("active", true);
    if (subsErr) {
      // Nothing was sent - release the claim so a retry is possible.
      await admin.from("weekly_email_sends").delete().eq("id", claimId);
      return { ok: false, error: `Could not load subscribers: ${subsErr.message}` };
    }
    const recipients = (subs ?? []).filter(
      (s: any) => typeof s.email === "string" && typeof s.unsubscribe_token === "string",
    );
    if (recipients.length === 0) {
      await admin.from("weekly_email_sends").delete().eq("id", claimId);
      return { ok: false, error: "No active subscribers." };
    }

    let sentCount = 0;
    let firstMessageId: string | null = null;
    const failures: string[] = [];

    const buildEmailPayload = (r: { email: string; unsubscribe_token: string }) => {
      const unsubscribeUrl = `${SITE_URL}/unsubscribe/${r.unsubscribe_token}`;
      return {
        from: fromAddress,
        to: r.email,
        subject: content.subject,
        html: emailHtml({
          parshaLabel: content.parshaLabel!,
          intro: content.intro,
          resources: content.resources,
          unsubscribeUrl,
        }),
        text: emailText({
          parshaLabel: content.parshaLabel!,
          intro: content.intro,
          resources: content.resources,
          unsubscribeUrl,
        }),
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
      };
    };

    // One request per recipient, used as the fallback path for any chunk
    // whose batch call fails (Resend's batch endpoint appears all-or-nothing
    // per call, so one malformed/rejected address could otherwise cost the
    // other ~99 recipients in that chunk their send).
    const sendOne = async (r: { email: string; unsubscribe_token: string }) => {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(buildEmailPayload(r)),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          failures.push(`${r.email}: ${res.status} ${errText.slice(0, 120)}`);
          return;
        }
        sentCount++;
        if (!firstMessageId) {
          try {
            const j = (await res.json()) as { id?: string };
            if (j?.id) firstMessageId = j.id;
          } catch { /* ignore */ }
        }
      } catch (e) {
        failures.push(`${r.email}: ${e instanceof Error ? e.message : "send failed"}`);
      }
    };

    // Resend's batch endpoint accepts up to 100 distinct emails per call.
    // Chunking cuts a list of N sequential HTTP round trips down to ~N/100,
    // which matters as the subscriber list grows toward the platform's
    // execution-time limit for a single request.
    const BATCH_SIZE = 100;
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const chunk = recipients.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(chunk.map(buildEmailPayload)),
        });
        if (!res.ok) {
          // Whole-chunk failure - fall back to sending this chunk one at a
          // time so a single bad address doesn't cost the rest of it.
          await Promise.all(chunk.map(sendOne));
          continue;
        }
        const json = (await res.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;
        const results = json?.data ?? [];
        if (results.length !== chunk.length) {
          // Unexpected shape - don't guess which succeeded, fall back per-recipient.
          await Promise.all(chunk.map(sendOne));
          continue;
        }
        for (let j = 0; j < chunk.length; j++) {
          const id = results[j]?.id;
          if (id) {
            sentCount++;
            if (!firstMessageId) firstMessageId = id;
          } else {
            failures.push(`${chunk[j].email}: batch item failed`);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "batch send failed";
        for (const r of chunk) failures.push(`${r.email}: ${msg}`);
      }
    }

    if (sentCount === 0) {
      // Nothing actually went out - release the claim so a retry is possible
      // (e.g. once Resend/the network issue is resolved) instead of
      // permanently marking this week as sent.
      await admin.from("weekly_email_sends").delete().eq("id", claimId);
      return {
        ok: false,
        error: `All sends failed. First error: ${failures[0] ?? "unknown"}`,
      };
    }

    // Update the claim row (inserted before sending, above) with the final
    // results now that the send has actually completed.
    const { error: updErr } = await admin
      .from("weekly_email_sends")
      .update({
        sent_count: sentCount,
        provider_message_id: firstMessageId,
        notes: failures.length > 0 ? `Partial: ${failures.length} failed` : null,
      })
      .eq("id", claimId);
    if (updErr) {
      // Send happened but logging failed — surface as warning, do not fail UI.
      return {
        ok: true,
        sentCount,
        failedCount: failures.length,
        warning: `Sent ${sentCount} but could not record history: ${updErr.message}`,
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

    // Map each PDF id to the parsha week it belongs to, so downloads can be
    // grouped by parsha rather than by rolling date range.
    const pdfRows = await admin
      .from("pdfs")
      .select("id, title, parsha_key, jewish_year, created_at");
    const pdfInfo = new Map<
      string,
      { parsha: string; jewishYear: number | null; title: string; createdAt: string }
    >();
    const parshaOrder = new Map<string, string>(); // parsha -> latest pdf created_at
    for (const r of (pdfRows.data ?? []) as any[]) {
      const parsha = (r.parsha_key as string | null) ?? "";
      if (!parsha) continue;
      pdfInfo.set(r.id as string, {
        parsha,
        jewishYear: (r.jewish_year as number | null) ?? null,
        title: (r.title as string | null) ?? "(untitled)",
        createdAt: (r.created_at as string | null) ?? "",
      });
      const prev = parshaOrder.get(parsha);
      const at = (r.created_at as string | null) ?? "";
      if (!prev || at > prev) parshaOrder.set(parsha, at);
    }

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

    const eventList = events.slice(0, 20000).map((e) => {
      const info = e.publication_id ? pdfInfo.get(e.publication_id) : undefined;
      return {
        key: e.publication_id || `title:${e.publication_title || "(untitled)"}`,
        at: e.created_at,
        who: whoOf(e),
        parsha: info?.parsha ?? null,
        title: info?.title ?? e.publication_title ?? "(untitled)",
      };
    });

    const parshas = Array.from(parshaOrder.entries())
      .map(([parsha, at]) => ({ parsha, at }))
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .map((p) => p.parsha);

    return { days, total: events.length, byDay, byPdf, events: eventList, parshas };
  });

// ---------- Admin: "Since you were last here" mini dashboard ----------
export const adminMiniDashboard = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    // --- Anchor: settings row (id = 1), read BEFORE rolling the 30-minute window ---
    let anchorIso: string | null = null;
    let lastSeen: string | null = null;
    try {
      const { data: row } = await admin
        .from("settings")
        .select("admin_last_seen_at, admin_prev_seen_at")
        .eq("id", 1)
        .maybeSingle();

      lastSeen = ((row as any)?.admin_last_seen_at as string | null) ?? null;
      const prevSeen = ((row as any)?.admin_prev_seen_at as string | null) ?? null;
      const gapMs = lastSeen ? Date.now() - new Date(lastSeen).getTime() : Infinity;

      if (gapMs > 30 * 60 * 1000) {
        // New session: roll the window forward; the anchor becomes the old last_seen.
        anchorIso = lastSeen;
        await admin
          .from("settings")
          .update({ admin_prev_seen_at: lastSeen ?? nowIso, admin_last_seen_at: nowIso })
          .eq("id", 1);
      } else {
        // Same sitting: a refresh must not blank the card out.
        anchorIso = prevSeen;
        await admin.from("settings").update({ admin_last_seen_at: nowIso }).eq("id", 1);
      }
    } catch (e) {
      console.error("adminMiniDashboard anchor error", e);
    }

    // First-ever load (no anchor yet): fall back to the last 7 days.
    const fallbackWindow = !anchorIso;
    const sinceIso =
      anchorIso ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // --- PDF id -> { title, parsha }; same attribution the download analytics uses ---
    const pdfRows = await admin.from("pdfs").select("id, title, parsha_key, created_at");
    const pdfInfo = new Map<string, { title: string; parsha: string }>();
    const parshaOrder = new Map<string, string>(); // parsha -> latest pdf created_at
    for (const r of (pdfRows.data ?? []) as any[]) {
      const parsha = (r.parsha_key as string | null) ?? "";
      pdfInfo.set(r.id as string, {
        title: (r.title as string | null) ?? "(untitled)",
        parsha,
      });
      if (!parsha) continue;
      const at = (r.created_at as string | null) ?? "";
      const prev = parshaOrder.get(parsha);
      if (!prev || at > prev) parshaOrder.set(parsha, at);
    }
    const orderedParshas = Array.from(parshaOrder.entries())
      .sort((a, b) => (a[1] < b[1] ? 1 : -1))
      .map(([p]) => p);
    const currentParsha = orderedParshas[0] ?? null;
    const previousParsha = orderedParshas[1] ?? null;

    // --- Since the anchor: subscribers ---
    const newSubs = await admin
          .from("subscribers")
          .select("email, created_at")
          .gt("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(1000);
    const newSubscriberEmails = ((newSubs.data ?? []) as any[])
      .map((r) => (r.email as string | null) ?? "")
      .filter(Boolean);

    // --- Since the anchor: downloads + top 3 PDFs ---
    const recentDl = await admin
          .from("download_events")
          .select("publication_id, publication_title, created_at")
          .gt("created_at", sinceIso)
          .limit(20000);
    const recentEvents = (recentDl.data ?? []) as any[];
    const sinceTitleCounts = new Map<string, number>();
    for (const e of recentEvents) {
      const info = e.publication_id ? pdfInfo.get(e.publication_id as string) : undefined;
      const title = info?.title || (e.publication_title as string | null) || "(untitled)";
      sinceTitleCounts.set(title, (sinceTitleCounts.get(title) ?? 0) + 1);
    }
    const topSincePdfs = Array.from(sinceTitleCounts.entries())
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // --- Since the anchor: contact messages ---
    const newMsgs = await admin
          .from("contact_messages")
          .select("name, created_at")
          .gt("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(200);
    const newContactNames = ((newMsgs.data ?? []) as any[])
      .map((r) => ((r.name as string | null) ?? "").trim() || "Someone")
      .slice(0, 10);
    const newContactCount = ((newMsgs.data ?? []) as any[]).length;

    // --- This parsha vs last (same attribution as Download analytics) ---
    const allDl = await admin.from("download_events").select("publication_id").limit(50000);
    const allEvents = (allDl.data ?? []) as any[];
    let currentParshaDownloads = 0;
    let previousParshaDownloads = 0;
    for (const e of allEvents) {
      const info = e.publication_id ? pdfInfo.get(e.publication_id as string) : undefined;
      if (!info?.parsha) continue;
      if (currentParsha && info.parsha === currentParsha) currentParshaDownloads += 1;
      else if (previousParsha && info.parsha === previousParsha) previousParshaDownloads += 1;
    }

    const subCount = await admin.from("subscribers").select("id", { count: "exact", head: true });

    // --- Since the anchor: visitors + the single top traffic source ---
    let visitorsSince = 0;
    let topSourceSince: string | null = null;
    try {
      const pv = await admin
        .from("page_views")
        .select("session_id, utm_source, referrer_host")
        .gt("created_at", sinceIso)
        .limit(50000);
      const sessions = new Set<string>();
      const bySource = new Map<string, Set<string>>();
      for (const r of (pv.data ?? []) as any[]) {
        const sid = (r.session_id as string | null) ?? "";
        if (sid) sessions.add(sid);
        const src =
          ((r.utm_source as string | null) ?? "").trim() ||
          ((r.referrer_host as string | null) ?? "").trim() ||
          "Direct";
        if (!bySource.has(src)) bySource.set(src, new Set());
        if (sid) bySource.get(src)!.add(sid);
      }
      visitorsSince = sessions.size;
      const top = Array.from(bySource.entries()).sort((a, b) => b[1].size - a[1].size)[0];
      topSourceSince = top ? top[0] : null;
    } catch (e) {
      console.error("adminMiniDashboard traffic error", e);
    }

    return {
      fallbackWindow,
      anchorIso: fallbackWindow ? null : sinceIso,
      lastSeenAt: fallbackWindow ? null : lastSeen,
      newSubscriberCount: newSubscriberEmails.length,
      newSubscriberEmails: newSubscriberEmails.slice(0, 10),
      totalSubscribers: subCount.count ?? 0,
      downloadsSince: recentEvents.length,
      topSincePdfs,
      newContactCount,
      newContactNames,
      currentParsha,
      previousParsha,
      currentParshaDownloads,
      previousParshaDownloads,
      visitorsSince,
      topSourceSince,
    };
  });

// ---------- Admin: first-party site traffic ----------
type TrafficWindow = { parsha: string; start: string; end: string };

/**
 * Parsha weeks derived from the pdfs table — the same grouping the Download
 * analytics section uses. Each parsha owns the time window that starts when
 * its first PDF was uploaded and ends when the next parsha's window begins.
 */
function buildParshaWindows(
  pdfRows: Array<{ parsha_key: string | null; created_at: string | null }>,
): TrafficWindow[] {
  const firstAt = new Map<string, string>();
  const lastAt = new Map<string, string>();
  for (const r of pdfRows) {
    const parsha = r.parsha_key ?? "";
    const at = r.created_at ?? "";
    if (!parsha || !at) continue;
    const f = firstAt.get(parsha);
    if (!f || at < f) firstAt.set(parsha, at);
    const l = lastAt.get(parsha);
    if (!l || at > l) lastAt.set(parsha, at);
  }
  // Newest first, ordered by the latest upload in each week.
  const ordered = Array.from(lastAt.entries())
    .sort((a, b) => (a[1] < b[1] ? 1 : -1))
    .map(([p]) => p);

  const out: TrafficWindow[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const parsha = ordered[i]!;
    const start = firstAt.get(parsha)!;
    const end = i === 0 ? new Date(Date.now() + 60_000).toISOString() : out[i - 1]!.start;
    out.push({ parsha, start, end });
  }
  return out;
}

type PageViewRow = {
  created_at: string;
  path: string | null;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  session_id: string | null;
  visitor_id: string | null;
  is_new_visitor: boolean | null;
  device_type: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
};

function inWindow(at: string, w: TrafficWindow | null): boolean {
  return !!w && at >= w.start && at < w.end;
}

function summarizeViews(rows: PageViewRow[]) {
  const sessions = new Set<string>();
  const visitors = new Set<string>();
  const returningVisitors = new Set<string>();
  const sourceSessions = new Map<string, Set<string>>();
  const pathCounts = new Map<string, number>();
  const cityCounts = new Map<string, number>();
  const deviceSessions = new Map<string, Set<string>>();

  for (const r of rows) {
    const sid = r.session_id ?? "";
    const vid = r.visitor_id ?? "";
    if (sid) sessions.add(sid);
    if (vid) {
      visitors.add(vid);
      if (r.is_new_visitor !== true) returningVisitors.add(vid);
    }

    const source = r.utm_source?.trim() || r.referrer_host?.trim() || "Direct";
    if (!sourceSessions.has(source)) sourceSessions.set(source, new Set());
    if (sid) sourceSessions.get(source)!.add(sid);

    const path = r.path || "/";
    pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1);

    const cityParts = [r.city, r.region, r.country].filter(Boolean) as string[];
    if (cityParts.length) {
      const label = cityParts.join(", ");
      cityCounts.set(label, (cityCounts.get(label) ?? 0) + 1);
    }

    const device = r.device_type || "unknown";
    if (!deviceSessions.has(device)) deviceSessions.set(device, new Set());
    if (sid) deviceSessions.get(device)!.add(sid);
  }

  const sortedCounts = (m: Map<string, number>, limit: number) =>
    Array.from(m.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

  return {
    pageviews: rows.length,
    visitors: sessions.size,
    uniqueVisitors: visitors.size,
    returningVisitors: returningVisitors.size,
    sources: Array.from(sourceSessions.entries())
      .map(([label, set]) => ({ label, count: set.size }))
      .sort((a, b) => b.count - a.count),
    topPages: sortedCounts(pathCounts, 10),
    topCities: sortedCounts(cityCounts, 10),
    devices: Array.from(deviceSessions.entries())
      .map(([label, set]) => ({ label, count: set.size }))
      .sort((a, b) => b.count - a.count),
  };
}

export const adminSiteTraffic = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; parsha?: string | null }) =>
    z
      .object({ accessToken: z.string().min(10), parsha: z.string().nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();

    const pdfRes = await admin.from("pdfs").select("id, title, parsha_key, created_at");
    const pdfRows = (pdfRes.data ?? []) as Array<{
      id: string;
      title: string | null;
      parsha_key: string | null;
      created_at: string | null;
    }>;
    const windows = buildParshaWindows(pdfRows);
    const parshaToWindow = new Map(windows.map((w) => [w.parsha, w]));
    const pdfParsha = new Map<string, string>();
    for (const r of pdfRows) if (r.parsha_key) pdfParsha.set(r.id, r.parsha_key);

    const selected = data.parsha && parshaToWindow.has(data.parsha) ? data.parsha : (windows[0]?.parsha ?? null);
    const selectedIdx = selected ? windows.findIndex((w) => w.parsha === selected) : -1;
    const previous = selectedIdx >= 0 ? (windows[selectedIdx + 1]?.parsha ?? null) : null;
    const curWin = selected ? parshaToWindow.get(selected)! : null;
    const prevWin = previous ? parshaToWindow.get(previous)! : null;

    const earliest = prevWin?.start ?? curWin?.start ?? new Date().toISOString();

    const viewsRes = await admin
      .from("page_views")
      .select(
        "created_at, path, referrer_host, utm_source, utm_medium, utm_campaign, session_id, visitor_id, is_new_visitor, device_type, city, region, country",
      )
      .gte("created_at", earliest)
      .order("created_at", { ascending: false })
      .limit(50000);
    const allViews = (viewsRes.data ?? []) as PageViewRow[];

    const curViews = allViews.filter((r) => inWindow(r.created_at, curWin));
    const prevViews = allViews.filter((r) => inWindow(r.created_at, prevWin));

    const current = summarizeViews(curViews);
    const prev = summarizeViews(prevViews);

    // Downloads for the same parsha week — attributed by the PDF's parsha,
    // exactly as the Download analytics section does.
    const dlRes = await admin.from("download_events").select("publication_id").limit(50000);
    let currentDownloads = 0;
    let previousDownloads = 0;
    for (const e of (dlRes.data ?? []) as Array<{ publication_id: string | null }>) {
      const p = e.publication_id ? pdfParsha.get(e.publication_id) : undefined;
      if (!p) continue;
      if (selected && p === selected) currentDownloads += 1;
      else if (previous && p === previous) previousDownloads += 1;
    }

    // New subscribers in the same time windows.
    const subsRes = await admin
      .from("subscribers")
      .select("created_at")
      .gte("created_at", earliest)
      .limit(20000);
    const subRows = (subsRes.data ?? []) as Array<{ created_at: string }>;
    const currentSubscribers = subRows.filter((r) => inWindow(r.created_at, curWin)).length;
    const previousSubscribers = subRows.filter((r) => inWindow(r.created_at, prevWin)).length;

    // Searches in the selected week.
    const searchRes = await admin
      .from("search_events")
      .select("query, result_count, created_at")
      .gte("created_at", curWin?.start ?? earliest)
      .order("created_at", { ascending: false })
      .limit(2000);
    const searchRows = ((searchRes.data ?? []) as Array<{
      query: string;
      result_count: number;
      created_at: string;
    }>).filter((r) => inWindow(r.created_at, curWin));
    const searchMap = new Map<string, { query: string; count: number; results: number }>();
    for (const r of searchRows) {
      const key = r.query.toLowerCase();
      const cur = searchMap.get(key);
      if (cur) {
        cur.count += 1;
        cur.results = r.result_count;
      } else {
        searchMap.set(key, { query: r.query, count: 1, results: r.result_count ?? 0 });
      }
    }
    const searches = Array.from(searchMap.values()).sort((a, b) => b.count - a.count);

    return {
      parshas: windows.map((w) => w.parsha),
      selectedParsha: selected,
      previousParsha: previous,
      current,
      previous_: prev,
      currentDownloads,
      previousDownloads,
      currentSubscribers,
      previousSubscribers,
      searches,
      rawRows: curViews.slice(0, 5000),
    };
  });

// ---------- Admin: downloads feed (totals + searchable recent list) ----------
export const adminDownloadFeed = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { accessToken: string; days?: number | null; search?: string; limit?: number; offset?: number }) =>
      z
        .object({
          accessToken: z.string().min(10),
          days: z.number().int().min(1).max(3650).nullable().optional(),
          search: z.string().max(200).optional(),
          limit: z.number().int().min(1).max(200).optional(),
          offset: z.number().int().min(0).max(100000).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();

    const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
    const DAY = 24 * 60 * 60 * 1000;
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const countSince = async (sinceIso: string | null) => {
      let q = admin.from("download_events").select("id", { count: "exact", head: true });
      if (sinceIso) q = q.gte("created_at", sinceIso);
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    };

    const [totalAll, total7, total30, totalToday] = await Promise.all([
      countSince(null),
      countSince(iso(7 * DAY)),
      countSince(iso(30 * DAY)),
      countSince(startOfToday.toISOString()),
    ]);

    const limit = data.limit ?? 50;
    const offset = data.offset ?? 0;
    const search = (data.search ?? "").trim();

    // Over-fetch a little when searching, since parsha matching happens after
    // the rows are joined to their PDF in memory. Without a search the
    // database can page directly, so ask for one extra row to learn whether
    // another page exists.
    const fetchLimit = search ? Math.min(5000, (offset + limit) * 10 + 200) : limit + 1;

    let q = admin
      .from("download_events")
      .select("id, created_at, publication_id, publication_title, city, region, country")
      .order("created_at", { ascending: false });
    if (search) {
      q = q.limit(fetchLimit);
    } else {
      // Real offset paging: previously every page re-fetched the newest rows,
      // so "Load more" had nothing left to show past the first page.
      q = q.range(offset, offset + limit);
    }
    if (data.days) q = q.gte("created_at", iso(data.days * DAY));
    // Search matches title, parsha, or location, so filtering happens in
    // memory after each row is joined to its PDF.
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);


    const pdfRows = await admin.from("pdfs").select("id, title, parsha_key, jewish_year");
    const pdfInfo = new Map<string, { title: string; parsha: string | null; jewishYear: number | null }>();
    for (const r of (pdfRows.data ?? []) as Array<Record<string, unknown>>) {
      pdfInfo.set(r["id"] as string, {
        title: ((r["title"] as string | null) ?? "(untitled)"),
        parsha: (r["parsha_key"] as string | null) ?? null,
        jewishYear: (r["jewish_year"] as number | null) ?? null,
      });
    }

    const all = ((rows ?? []) as Array<{
      id: string;
      created_at: string;
      publication_id: string | null;
      publication_title: string | null;
      city: string | null;
      region: string | null;
      country: string | null;
    }>).map((r) => {
      const info = r.publication_id ? pdfInfo.get(r.publication_id) : undefined;
      return {
        id: r.id,
        at: r.created_at,
        title: r.publication_title ?? info?.title ?? "(unknown)",
        parsha: info?.parsha ?? null,
        jewishYear: info?.jewishYear ?? null,
        city: r.city,
        region: r.region,
        country: r.country,
      };
    });

    const needle = search.toLowerCase();
    const filtered = needle
      ? all.filter((e) =>
          [e.title, e.parsha, e.city, e.region, e.country]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle)),
        )
      : all;

    // Searching filters in memory from row 0, so it still slices by offset.
    // Without a search the database already returned exactly this page (plus
    // one lookahead row).
    const page = search ? filtered.slice(offset, offset + limit) : filtered.slice(0, limit);
    const hasMore = search ? filtered.length > offset + limit : filtered.length > limit;


    // Chart aggregates cover the whole selected range, independent of paging.
    let aggQ = admin
      .from("download_events")
      .select("created_at, country, region")
      .order("created_at", { ascending: false })
      .limit(20000);
    if (data.days) aggQ = aggQ.gte("created_at", iso(data.days * DAY));
    const { data: aggRows } = await aggQ;

    const byDay = new Map<string, number>();
    const byCountry = new Map<string, number>();
    const byRegion = new Map<string, number>();
    for (const r of (aggRows ?? []) as Array<{ created_at: string; country: string | null; region: string | null }>) {
      const day = r.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      const c = r.country ?? "Unknown";
      byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
      const reg = r.region ? `${r.region}${r.country ? `, ${r.country}` : ""}` : "Unknown";
      byRegion.set(reg, (byRegion.get(reg) ?? 0) + 1);
    }

    const topList = (m: Map<string, number>, n: number) =>
      [...m.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, n);

    return {
      totals: { all: totalAll, last7: total7, last30: total30, today: totalToday },
      events: page,
      hasMore,
      series: [...byDay.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
      byCountry: topList(byCountry, 8),
      byRegion: topList(byRegion, 8),
    };
  });

// Minute-by-minute download counts for a short recent window, so spikes
// inside the last hour are visible instead of being flattened into a day.
export const adminDownloadMinutes = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; minutes?: number }) =>
    z
      .object({
        accessToken: z.string().min(10),
        minutes: z.number().int().min(5).max(1440).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();

    const minutes = data.minutes ?? 60;
    const now = Date.now();
    const startMs = Math.floor((now - minutes * 60_000) / 60_000) * 60_000;

    const { data: rows, error } = await admin
      .from("download_events")
      .select("created_at")
      .gte("created_at", new Date(startMs).toISOString())
      .order("created_at", { ascending: false })
      .limit(20000);
    if (error) throw new Error(error.message);

    const counts = new Map<number, number>();
    for (const r of (rows ?? []) as Array<{ created_at: string }>) {
      const bucket = Math.floor(new Date(r.created_at).getTime() / 60_000) * 60_000;
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }

    const series: Array<{ minute: string; count: number }> = [];
    for (let t = startMs; t <= now; t += 60_000) {
      series.push({ minute: new Date(t).toISOString(), count: counts.get(t) ?? 0 });
    }

    const total = series.reduce((s, p) => s + p.count, 0);
    const peak = series.reduce((m, p) => Math.max(m, p.count), 0);
    return { minutes, series, total, peak };
  });

// Top traffic sources: which referrers/campaigns/landing pages drive site

// visits (page_views) and which ones drive actual PDF downloads
// (download_attribution).
export const adminTrafficSources = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; days?: number | null }) =>
    z
      .object({
        accessToken: z.string().min(10),
        days: z.number().int().min(1).max(3650).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken);
    const DAY = 24 * 60 * 60 * 1000;
    const sinceIso = data.days ? new Date(Date.now() - data.days * DAY).toISOString() : null;

    const tally = (rows: Array<Record<string, unknown>>, pick: (r: Record<string, unknown>) => string) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const k = pick(r);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    };

    // Visits (external analytics project).
    const ext = getSupabaseAdmin();
    let viewsQ = ext
      .from("page_views")
      .select("path, referrer_host, utm_source, utm_medium, utm_campaign, session_id, created_at")
      .order("created_at", { ascending: false })
      .limit(20000);
    if (sinceIso) viewsQ = viewsQ.gte("created_at", sinceIso);
    const { data: viewRows } = await viewsQ;
    const views = (viewRows ?? []) as Array<Record<string, unknown>>;

    // Landing page = the earliest pageview of each session in range.
    const firstBySession = new Map<string, Record<string, unknown>>();
    for (const v of views) {
      const sid = (v["session_id"] as string | null) ?? "";
      if (!sid) continue;
      // Rows arrive newest-first, so the last write per session is the oldest.
      firstBySession.set(sid, v);
    }
    const landings = [...firstBySession.values()];

    // Downloads (Cloud project attribution table).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let attrQ = supabaseAdmin
      .from("download_attribution")
      .select("referrer_host, utm_source, utm_medium, utm_campaign, landing_path, source_path, session_id, created_at")
      .order("created_at", { ascending: false })
      .limit(20000);
    if (sinceIso) attrQ = attrQ.gte("created_at", sinceIso);
    const { data: attrRows } = await attrQ;
    const downloads = (attrRows ?? []) as unknown as Array<Record<string, unknown>>;

    const direct = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "Direct / none");
    const unknownPath = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "(unknown)");
    const campaign = (r: Record<string, unknown>) => {
      const src = r["utm_source"];
      if (typeof src !== "string" || !src.trim()) return null;
      const med = typeof r["utm_medium"] === "string" && r["utm_medium"] ? ` / ${r["utm_medium"] as string}` : "";
      const camp =
        typeof r["utm_campaign"] === "string" && r["utm_campaign"] ? ` — ${r["utm_campaign"] as string}` : "";
      return `${src.trim()}${med}${camp}`;
    };

    // Visit -> download funnel: for each session we know its first-touch
    // dimensions (from page_views); a session "converted" if it produced at
    // least one attributed download.
    const convertedSessions = new Set<string>();
    for (const d of downloads) {
      const sid = d["session_id"];
      if (typeof sid === "string" && sid) convertedSessions.add(sid);
    }
    const funnelBy = (pick: (r: Record<string, unknown>) => string | null) => {
      const m = new Map<string, { sessions: number; downloads: number }>();
      for (const [sid, row] of firstBySession.entries()) {
        const key = pick(row);
        if (key === null) continue;
        const cur = m.get(key) ?? { sessions: 0, downloads: 0 };
        cur.sessions += 1;
        if (convertedSessions.has(sid)) cur.downloads += 1;
        m.set(key, cur);
      }
      return [...m.entries()]
        .map(([name, v]) => ({
          name,
          sessions: v.sessions,
          downloads: v.downloads,
          rate: v.sessions ? v.downloads / v.sessions : 0,
        }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 10);
    };
    const totalSessions = firstBySession.size;
    let convertedTotal = 0;
    for (const sid of firstBySession.keys()) if (convertedSessions.has(sid)) convertedTotal += 1;

    return {
      funnel: {
        sessions: totalSessions,
        converted: convertedTotal,
        rate: totalSessions ? convertedTotal / totalSessions : 0,
        matchedDownloads: convertedSessions.size,
        byReferrer: funnelBy((r) => direct(r["referrer_host"])),
        byLandingPage: funnelBy((r) => unknownPath(r["path"])),
        byCampaign: funnelBy((r) => campaign(r)),
      },
      visits: {
        total: views.length,
        referrers: tally(views, (r) => direct(r["referrer_host"])),
        landingPages: tally(landings, (r) => unknownPath(r["path"])),
        campaigns: tally(
          views.filter((r) => campaign(r) !== null),
          (r) => campaign(r) as string,
        ),
      },
      downloads: {
        total: downloads.length,
        referrers: tally(downloads, (r) => direct(r["referrer_host"])),
        landingPages: tally(downloads, (r) => unknownPath(r["landing_path"])),
        downloadPages: tally(downloads, (r) => unknownPath(r["source_path"])),
        campaigns: tally(
          downloads.filter((r) => campaign(r) !== null),
          (r) => campaign(r) as string,
        ),
      },
    };
  });
