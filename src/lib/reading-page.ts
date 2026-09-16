import { publicationSlug } from "@/lib/publication-slug";

const YOM_TOV_KEYS = new Set([
  "rosh-hashanah",
  "yom-kippur",
  "sukkos",
  "sukkot",
  "shemini-atzeres",
  "shemini-atzeret",
  "simchas-torah",
  "simchat-torah",
  "pesach",
  "passover",
  "shavuos",
  "shavuot",
]);

export function readingSlug(reading: string): string {
  return publicationSlug(reading.replace(/^(parshas|parashat)\s+/i, "").trim());
}

export function isYomTovReading(reading: string): boolean {
  return YOM_TOV_KEYS.has(readingSlug(reading));
}

export function readingPagePath(reading: string, jewishYear: number): string {
  const base = isYomTovReading(reading) ? "yom-tov" : "parsha";
  return `/${base}/${readingSlug(reading)}/${jewishYear}`;
}
