// Canonical parsha list (English / "Parshas" form) plus major Yom Tovim that
// can fall on Shabbos and effectively replace the parsha reading.
export const PARSHIYOS: string[] = [
  "Bereishis", "Noach", "Lech Lecha", "Vayeira", "Chayei Sarah", "Toldos",
  "Vayeitzei", "Vayishlach", "Vayeishev", "Mikeitz", "Vayigash", "Vayechi",
  "Shemos", "Va'eira", "Bo", "Beshalach", "Yisro", "Mishpatim", "Terumah",
  "Tetzaveh", "Ki Sisa", "Vayakhel", "Pekudei", "Vayakhel-Pekudei",
  "Vayikra", "Tzav", "Shemini", "Tazria", "Metzora", "Tazria-Metzora",
  "Acharei Mos", "Kedoshim", "Acharei Mos-Kedoshim", "Emor", "Behar",
  "Bechukosai", "Behar-Bechukosai", "Bamidbar", "Naso", "Beha'aloscha",
  "Shelach", "Korach", "Chukas", "Balak", "Chukas-Balak", "Pinchas",
  "Matos", "Masei", "Matos-Masei", "Devarim", "Va'eschanan", "Eikev",
  "Re'eh", "Shoftim", "Ki Seitzei", "Ki Savo", "Nitzavim", "Vayeilech",
  "Nitzavim-Vayeilech", "Ha'azinu", "Vezos Habrachah",
  "Rosh Hashanah", "Yom Kippur", "Sukkos", "Shemini Atzeres",
  "Simchas Torah", "Pesach", "Shavuos",
];

/** The 54 weekly parshiyos in reading order (no combined readings). */
export const PARSHIYOS_54: string[] = [
  "Bereishis", "Noach", "Lech Lecha", "Vayeira", "Chayei Sarah", "Toldos",
  "Vayeitzei", "Vayishlach", "Vayeishev", "Mikeitz", "Vayigash", "Vayechi",
  "Shemos", "Va'eira", "Bo", "Beshalach", "Yisro", "Mishpatim", "Terumah",
  "Tetzaveh", "Ki Sisa", "Vayakhel", "Pekudei", "Vayikra", "Tzav", "Shemini",
  "Tazria", "Metzora", "Acharei Mos", "Kedoshim", "Emor", "Behar",
  "Bechukosai", "Bamidbar", "Naso", "Beha'aloscha", "Shelach", "Korach",
  "Chukas", "Balak", "Pinchas", "Matos", "Masei", "Devarim", "Va'eschanan",
  "Eikev", "Re'eh", "Shoftim", "Ki Seitzei", "Ki Savo", "Nitzavim",
  "Vayeilech", "Ha'azinu", "Vezos Habrachah",
];

/**
 * Normalize a Hebcal reading name before lookup: drop the "Parashat " prefix
 * and convert typographic apostrophes (U+2019) to straight ASCII ones.
 */
export function normalizeHebcalName(title: string): string {
  return title
    .replace(/\u2019/g, "'")
    .replace(/^Parashat\s+/i, "")
    .trim();
}

export function hebcalToParshaKey(hebcalTitle: string): string {
  const cleaned = normalizeHebcalName(hebcalTitle);
  const map: Record<string, string> = {
    "Vaera": "Va'eira",
    "Va'era": "Va'eira",
    "Acharei Mot": "Acharei Mos",
    "Acharei Mot-Kedoshim": "Acharei Mos-Kedoshim",
    "Behar-Bechukotai": "Behar-Bechukosai",
    "Bechukotai": "Bechukosai",
    "Chukat": "Chukas",
    "Chukat-Balak": "Chukas-Balak",
    "Matot": "Matos",
    "Matot-Masei": "Matos-Masei",
    "Vaetchanan": "Va'eschanan",
    "Va'etchanan": "Va'eschanan",
    "Ki Teitzei": "Ki Seitzei",
    "Ki Tavo": "Ki Savo",
    "Vayelech": "Vayeilech",
    "Nitzavim-Vayelech": "Nitzavim-Vayeilech",
    "Haazinu": "Ha'azinu",
    "Vezot Haberakhah": "Vezos Habrachah",
    "Ki Tisa": "Ki Sisa",
    "Beha'alotcha": "Beha'aloscha",
    "Shlach": "Shelach",
    "Sh'lach": "Shelach",
    "Toldot": "Toldos",
    "Vayeshev": "Vayeishev",
    "Mikketz": "Mikeitz",
    "Shemot": "Shemos",
    "Bereshit": "Bereishis",
    "Chayei Sara": "Chayei Sarah",
  };
  return map[cleaned] ?? cleaned;
}

const YOM_TOV_MAP: Record<string, string> = {
  "Rosh Hashana": "Rosh Hashanah",
  "Rosh Hashanah": "Rosh Hashanah",
  "Yom Kippur": "Yom Kippur",
  "Sukkot": "Sukkos",
  "Sukkos": "Sukkos",
  "Shmini Atzeret": "Shemini Atzeres",
  "Shemini Atzeret": "Shemini Atzeres",
  "Simchat Torah": "Simchas Torah",
  "Pesach": "Pesach",
  "Shavuot": "Shavuos",
  "Shavuos": "Shavuos",
};

/**
 * Hebcal holiday titles carry decorations we don't want in a display key:
 * a Hebrew year ("Rosh Hashana 5787"), a day number ("Pesach VII",
 * "Sukkot II"), or a parenthetical ("Sukkot VII (Hoshana Raba)").
 * Strip all of those before mapping.
 */
export function normalizeYomTovTitle(title: string): string {
  return title
    .replace(/\u2019/g, "'")
    .replace(/\s*\(.*\)\s*$/, "")
    .replace(/\s+\d{4,5}\s*$/, "")
    .replace(/\s+(?:I|II|III|IV|V|VI|VII|VIII)\s*$/, "")
    .trim();
}

export function hebcalYomTovToKey(title: string): string | null {
  return YOM_TOV_MAP[normalizeYomTovTitle(title)] ?? null;
}


/** Major Yom Tovim that replace the weekly parsha reading. */
export const YOM_TOV_KEYS: string[] = [
  "Rosh Hashanah", "Yom Kippur", "Sukkos", "Shemini Atzeres",
  "Simchas Torah", "Pesach", "Shavuos",
];

/**
 * Display label for a reading key: Yom Tov names stand alone, weekly
 * parshiyos get the "Parshas " prefix (never doubled).
 */
export function formatReadingLabel(key: string): string {
  if (YOM_TOV_KEYS.includes(key)) return displayReadingName(key);
  if (/^parshas\s/i.test(key)) return displayReadingName(key);
  return `Parshas ${displayReadingName(key)}`;
}

/**
 * Site spelling convention for display only. Stored keys stay unchanged
 * ("Shemini Atzeres", "Ha'azinu") so routes, slugs and lookups keep working.
 */
export function displayReadingName(key: string): string {
  return key
    .replace(/\bShemini Atzeres\b/g, "Shmini Atzeres")
    .replace(/\bHa['\u2019]azinu\b/g, "Haazinu");
}

// Calendar order within one Jewish year (Rosh Hashanah first). Used to sort
// archive collections reverse-chronologically instead of by upload time.
// Vayeilech alone is Shabbos Shuva; Ha'azinu normally precedes Yom Kippur.
const CHRONO_ORDER: string[] = (() => {
  const head = ["Rosh Hashanah", "Vayeilech", "Ha'azinu", "Yom Kippur", "Sukkos", "Shemini Atzeres", "Simchas Torah", "Vezos Habrachah"];
  const body = PARSHIYOS.filter((k) => !head.includes(k) && !["Pesach", "Shavuos"].includes(k));
  const out: string[] = [...head];
  for (const k of body) {
    out.push(k);
    if (k === "Tzav") out.push("Pesach");
    if (k === "Bamidbar") out.push("Shavuos");
  }
  return out;
})();

/** Position of a reading within its Jewish year, or -1 when unknown. */
export function readingChronoIndex(key: string): number {
  const cleaned = key.replace(/^parshas\s+/i, "").replace(/\u2019/g, "'").trim();
  const exact = CHRONO_ORDER.indexOf(cleaned);
  if (exact >= 0) return exact;
  const lower = cleaned.toLowerCase().replace(/[^a-z]/g, "");
  return CHRONO_ORDER.findIndex((k) => k.toLowerCase().replace(/[^a-z]/g, "") === lower);
}
