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
  "Sukkot I": "Sukkos",
  "Sukkot II": "Sukkos",
  "Shmini Atzeret": "Shemini Atzeres",
  "Simchat Torah": "Simchas Torah",
  "Pesach": "Pesach",
  "Pesach I": "Pesach",
  "Pesach II": "Pesach",
  "Pesach VII": "Pesach",
  "Pesach VIII": "Pesach",
  "Shavuot": "Shavuos",
  "Shavuot I": "Shavuos",
  "Shavuot II": "Shavuos",
};

export function hebcalYomTovToKey(title: string): string | null {
  return YOM_TOV_MAP[title] ?? null;
}
