/**
 * Pure grouping for the /originals "Our Original Editions" section.
 *
 * Input rows must already be published pdfs rows. Ownership comes only from
 * the canonical publication_id (never a title match), and each row stays under
 * its own parsha_key + jewish_year, so last week's PDF is never shown under a
 * newer parsha. Weeks with fewer than three published originals show only the
 * real ones.
 */
import { TFTT_ORIGINAL_SERIES, tfttOriginalSeriesById } from "@/lib/tftt-originals";
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

const SERIES_ORDER: string[] = TFTT_ORIGINAL_SERIES.map((s) => s.id);

export function groupOriginalEditions(
  rows: OriginalEditionRow[],
  thumbUrl: (pdfId: string) => string | null,
  maxGroups = 12,
): OriginalEditionGroup[] {
  type Acc = { parshaKey: string; jewishYear: number; latest: string; bySeries: Map<string, OriginalEditionRow> };
  const groups = new Map<string, Acc>();

  for (const row of rows) {
    const series = tfttOriginalSeriesById(row.publication_id);
    const parshaKey = row.parsha_key?.trim();
    const year = row.jewish_year;
    if (!series || !parshaKey || typeof year !== "number" || !Number.isFinite(year)) continue;
    const key = `${parshaKey.toLowerCase()}|${year}`;
    let g = groups.get(key);
    if (!g) {
      g = { parshaKey, jewishYear: year, latest: "", bySeries: new Map() };
      groups.set(key, g);
    }
    const created = row.created_at ?? "";
    if (created > g.latest) g.latest = created;
    // One card per series per week: keep the most recently uploaded row.
    const existing = g.bySeries.get(series.id);
    if (!existing || (existing.created_at ?? "") < created) g.bySeries.set(series.id, row);
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
          const series = tfttOriginalSeriesById(row.publication_id)!;
          return { id: row.id, seriesId: series.id, seriesTitle: series.title, thumbUrl: thumbUrl(row.id) };
        }),
    }));
}
