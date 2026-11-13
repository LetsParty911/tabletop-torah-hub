/**
 * Pure grouping for the /originals "Our Original Editions" section.
 *
 * Input rows must already be published pdfs rows. Ownership comes only from
 * the canonical publication_id (never a title match), and each row stays under
 * its own parsha_key + jewish_year, so last week's PDF is never shown under a
 * newer parsha. Weeks with fewer than three published originals show only the
 * real ones.
 */
import {
  TFTT_ORIGINAL_EDITION_SERIES,
  TFTT_ORIGINAL_SERIES,
  type TfttOriginalSeries,
} from "@/lib/tftt-originals";
import { formatReadingLabel, readingChronoIndex } from "@/lib/parshiyos";

export type OriginalEditionRow = {
  id: string;
  parsha_key: string | null;
  jewish_year: number | null;
  publication_id: string | null;
  created_at: string | null;
};

export type OriginalEditionCard = {
  id: string;
  seriesId: string;
  seriesTitle: string;
  thumbUrl: string | null;
};

export type OriginalEditionGroup = {
  key: string;
  parshaKey: string;
  jewishYear: number;
  label: string;
  editions: OriginalEditionCard[];
};

function seriesLookup(series: readonly TfttOriginalSeries[]) {
  return (publicationId: string | null | undefined) =>
    (publicationId ? series.find((s) => s.id === publicationId) : undefined) ?? null;
}

function isListableRow(row: OriginalEditionRow): boolean {
  return !!row.parsha_key?.trim() && typeof row.jewish_year === "number" && Number.isFinite(row.jewish_year);
}

export function groupOriginalEditions(
  rows: OriginalEditionRow[],
  thumbUrl: (pdfId: string) => string | null,
  maxGroups = 12,
  series: readonly TfttOriginalSeries[] = TFTT_ORIGINAL_EDITION_SERIES,
): OriginalEditionGroup[] {
  const tfttOriginalSeriesById = seriesLookup(series);
  const SERIES_ORDER: string[] = series.map((s) => s.id);
  type Acc = { parshaKey: string; jewishYear: number; latest: string; bySeries: Map<string, OriginalEditionRow> };
  const groups = new Map<string, Acc>();

  for (const row of rows) {
    const owner = tfttOriginalSeriesById(row.publication_id);
    if (!owner || !isListableRow(row)) continue;
    const parshaKey = row.parsha_key!.trim();
    const year = row.jewish_year as number;
    const key = `${parshaKey.toLowerCase()}|${year}`;
    let g = groups.get(key);
    if (!g) {
      g = { parshaKey, jewishYear: year, latest: "", bySeries: new Map() };
      groups.set(key, g);
    }
    const created = row.created_at ?? "";
    if (created > g.latest) g.latest = created;
    // One card per series per week: keep the most recently uploaded row.
    const existing = g.bySeries.get(owner.id);
    if (!existing || (existing.created_at ?? "") < created) g.bySeries.set(owner.id, row);
  }

  return [...groups.entries()]
    .sort(([, a], [, b]) => {
      if (a.jewishYear !== b.jewishYear) return b.jewishYear - a.jewishYear;
      const ia = readingChronoIndex(a.parshaKey);
      const ib = readingChronoIndex(b.parshaKey);
      if (ia >= 0 && ib >= 0 && ia !== ib) return ib - ia;
      return b.latest.localeCompare(a.latest);
    })
    .slice(0, maxGroups)
    .map(([key, g]) => ({
      key,
      parshaKey: g.parshaKey,
      jewishYear: g.jewishYear,
      label: `${formatReadingLabel(g.parshaKey)} ${g.jewishYear}`,
      editions: [...g.bySeries.values()]
        .sort((a, b) => SERIES_ORDER.indexOf(a.publication_id!) - SERIES_ORDER.indexOf(b.publication_id!))
        .map((row) => {
          const owner = tfttOriginalSeriesById(row.publication_id)!;
          return { id: row.id, seriesId: owner.id, seriesTitle: owner.title, thumbUrl: thumbUrl(row.id) };
        }),
    }));
}

/** Series ids with at least one real, listable published edition in `rows`. */
export function activeOriginalSeriesIds(
  rows: OriginalEditionRow[],
  series: readonly TfttOriginalSeries[] = TFTT_ORIGINAL_EDITION_SERIES,
): string[] {
  const lookup = seriesLookup(series);
  const ids = new Set<string>();
  for (const row of rows) {
    const owner = lookup(row.publication_id);
    if (owner && isListableRow(row)) ids.add(owner.id);
  }
  return series.map((s) => s.id).filter((id) => ids.has(id));
}

/**
 * Series cards shown on /originals. Every configured TFTT original is visible
 * even before its first weekly PDF is published; edition grids still contain
 * only real published PDFs.
 */
export function visibleOriginalSeries(
  _activeIds: readonly string[] | null | undefined,
  series: readonly TfttOriginalSeries[] = TFTT_ORIGINAL_EDITION_SERIES,
): TfttOriginalSeries[] {
  return [...series];
}

const THREE_SERIES_DESCRIPTION =
  "Three weekly Torah For The Table original series: Parsha Challenge, Stories for the Shabbos Table, and In the Margins — created for the Shabbos table.";

/** /originals meta description; unchanged while only the three weekly series are visible. */
export function originalsPageDescription(visible: readonly TfttOriginalSeries[]): string {
  if (visible.length <= TFTT_ORIGINAL_SERIES.length) return THREE_SERIES_DESCRIPTION;
  const titles = visible.map((s) => s.title);
  const list = `${titles.slice(0, -1).join(", ")}, and ${titles[titles.length - 1]}`;
  return `Torah For The Table original series: ${list} — created for the Shabbos table.`;
}
