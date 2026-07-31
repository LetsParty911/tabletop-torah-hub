/**
 * Standardizes Torah terminology in publication-supplied copy (descriptions,
 * subtitles) so the public site reads consistently:
 *   Parshas, Shabbos, Dvar Torah / Divrei Torah, ArtScroll, Halacha.
 *
 * Only applied to display text — never to publication proper names, file
 * contents, or admin-entered values as stored in the database.
 */
const RULES: Array<[RegExp, string]> = [
  // Shabbat -> Shabbos
  [/\bShabbat\b/g, "Shabbos"],
  [/\bshabbat\b/g, "Shabbos"],
  // Parashat / Parshat / Parasha / Parashah / Parsha -> Parshas / parsha forms
  [/\bParashat\b/g, "Parshas"],
  [/\bparashat\b/g, "Parshas"],
  [/\bParshat\b/g, "Parshas"],
  [/\bparshat\b/g, "Parshas"],
  [/\bParashah\b/g, "Parsha"],
  [/\bparashah\b/g, "parsha"],
  [/\bParashot\b/g, "Parshiyos"],
  [/\bparashot\b/g, "parshiyos"],
  [/\bParashiyot\b/g, "Parshiyos"],
  [/\bparashiyot\b/g, "parshiyos"],
  [/\bParasha\b/g, "Parsha"],
  [/\bparasha\b/g, "parsha"],
  // Devar / Divrei Torah
  [/\bDevar Torah\b/g, "Dvar Torah"],
  [/\bdevar Torah\b/g, "Dvar Torah"],
  [/\bDivrei Torah\b/g, "Divrei Torah"],
  [/\bDivrey Torah\b/g, "Divrei Torah"],
  // ArtScroll
  [/\bArtscroll\b/g, "ArtScroll"],
  [/\bartscroll\b/g, "ArtScroll"],
  [/\bArt Scroll\b/g, "ArtScroll"],
  // Halacha
  [/\bHalachah\b/g, "Halacha"],
  [/\bhalachah\b/g, "Halacha"],
  [/\bHalakhah\b/g, "Halacha"],
  [/\bhalakhah\b/g, "Halacha"],
  [/\bHalakha\b/g, "Halacha"],
  [/\bhalakha\b/g, "Halacha"],
];

export function standardizeCopy<T extends string | null | undefined>(value: T): T {
  if (!value) return value;
  let out = value as string;
  for (const [pattern, replacement] of RULES) {
    out = out.replace(pattern, replacement);
  }
  return out as T;
}
