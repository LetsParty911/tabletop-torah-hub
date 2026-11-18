import { formatReadingLabel } from "@/lib/parshiyos";
import { isYomTovReading, readingSlug } from "@/lib/reading-page";

/**
 * Where the reader page's "Back" link should go (pure; unit tested).
 *
 * - This week's PDF (same reading and, when known, the same Jewish year)
 *   returns to the homepage weekly collection.
 * - An earlier PDF returns to its own parsha / Yom Tov year collection. That
 *   page lists every published PDF for the reading and year, so it always
 *   exists for a published PDF with both values.
 * - Anything else falls back to the Archive.
 */
export type ReaderBackLink =
  | { kind: "current"; label: string }
  | { kind: "parsha" | "yom-tov"; slug: string; year: string; label: string }
  | { kind: "archive"; label: string };

export function readerBackLink(input: {
  isCurrentWeek: boolean;
  parshaKey: string | null | undefined;
  jewishYear: number | null | undefined;
  currentJewishYear?: number | null;
}): ReaderBackLink {
  const parshaKey = input.parshaKey?.trim() ?? "";
  const year = typeof input.jewishYear === "number" && Number.isInteger(input.jewishYear) && input.jewishYear >= 5000 && input.jewishYear <= 7000
    ? input.jewishYear
    : null;
  const sameYear = year === null || input.currentJewishYear == null || year === input.currentJewishYear;
  if (input.isCurrentWeek && sameYear) {
    return { kind: "current", label: "Back to This Week’s Selections" };
  }
  const slug = parshaKey ? readingSlug(parshaKey) : "";
  if (slug && year !== null) {
    return {
      kind: isYomTovReading(parshaKey) ? "yom-tov" : "parsha",
      slug,
      year: String(year),
      label: `Back to ${formatReadingLabel(parshaKey)} ${year} Divrei Torah`,
    };
  }
  return { kind: "archive", label: "Back to the Archive" };
}

/** Hebrew-calendar year of a date (e.g. "2026-11-21" → 5787), or null when unavailable. */
export function hebrewYearOf(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(`${date.slice(0, 10)}T12:00:00Z`) : date;
  if (!Number.isFinite(d.getTime())) return null;
  try {
    const text = new Intl.DateTimeFormat("en-u-ca-hebrew", { year: "numeric", timeZone: "UTC" }).format(d);
    const year = Number(text.match(/\d{4}/)?.[0]);
    return Number.isInteger(year) && year > 5000 ? year : null;
  } catch {
    return null;
  }
}
