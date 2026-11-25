import { PARSHIYOS, formatReadingLabel } from "./parshiyos";
import { readingSlug, isYomTovReading } from "./reading-page";
import { toParshaComparableKey } from "./parsha-normalize";

type ReadingRow = { parsha_key: string | null; jewish_year: number | null };
export function canonicalLibraryReading(raw: string): string | undefined {
  const key = toParshaComparableKey(raw);
  return PARSHIYOS.find(name => toParshaComparableKey(name) === key);
}
/** Every archive-eligible PDF contributes once; aliases merge only when they identify the same reading. Unknown readings still get an archive link. */
export function summarizeReadingLibrary(rows: readonly ReadingRow[]) {
  const groups = new Map<string, { parsha_key: string; slug: string; label: string; count: number; years: Set<number>; permanentParsha: boolean }>();
  for (const row of rows) {
    const raw = row.parsha_key?.trim();
    const year = row.jewish_year;
    if (!raw || typeof year !== "number" || !year) continue;
    const canonical = canonicalLibraryReading(raw);
    const reading = canonical ?? raw;
    const slug = readingSlug(reading);
    if (!slug) continue;
    const key = toParshaComparableKey(reading);
    const group = groups.get(key) ?? { parsha_key: reading, slug, label: canonical ? formatReadingLabel(reading) : reading, count: 0, years: new Set<number>(), permanentParsha: !!canonical && !isYomTovReading(reading) };
    group.count++;
    group.years.add(year);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    const ai = PARSHIYOS.indexOf(a.parsha_key), bi = PARSHIYOS.indexOf(b.parsha_key);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.label.localeCompare(b.label);
  }).map(group => ({ ...group, years: [...group.years].sort((a,b) => b-a) }));
}

export const READING_LIBRARY_GROUPS = [
  { id: "bereishis", label: "Bereishis — בראשית", start: "Bereishis" },
  { id: "shemos", label: "Shemos — שמות", start: "Shemos" },
  { id: "vayikra", label: "Vayikra — ויקרא", start: "Vayikra" },
  { id: "bamidbar", label: "Bamidbar — במדבר", start: "Bamidbar" },
  { id: "devarim", label: "Devarim — דברים", start: "Devarim" },
  { id: "yom-tov", label: "Yom Tov", start: null },
  { id: "other-readings", label: "Other collections", start: null },
] as const;

export function readingLibraryGroup(raw: string): typeof READING_LIBRARY_GROUPS[number]["id"] {
  const canonical = canonicalLibraryReading(raw);
  if (isYomTovReading(canonical ?? raw)) return "yom-tov";
  const index = canonical ? PARSHIYOS.indexOf(canonical) : -1;
  if (index < 0) return "other-readings";
  for (const group of [...READING_LIBRARY_GROUPS].reverse()) {
    if (group.start && index >= PARSHIYOS.indexOf(group.start)) return group.id;
  }
  return "other-readings";
}
