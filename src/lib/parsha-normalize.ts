// Shared canonical parsha-key normalization. Used by admin upload, homepage
// filtering, and any future archive logic so storage and lookup always agree
// on a single comparable key regardless of spelling/transliteration variant.

const PARSHA_PREFIX_RE = /^(parshas|parashat|parsha)\s+/i;

const PARSHA_VARIANT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bachrei\b/g, "acharei"],
  [/\bmot\b/g, "mos"],
  [/\bshmini\b/g, "shemini"],
  [/\bsimchat\b/g, "simchas"],
  [/\bsukkot\b/g, "sukkos"],
  [/\bshavuot\b/g, "shavuos"],
  [/\bbechukotai\b/g, "bechukosai"],
  [/\bchukat\b/g, "chukas"],
  [/\bmatot\b/g, "matos"],
  [/\bvaetchanan\b/g, "vaeschanan"],
  [/\bvayelech\b/g, "vayeilech"],
  [/\bshlach\b/g, "shelach"],
  [/\btoldot\b/g, "toldos"],
  [/\bbereshit\b/g, "bereishis"],
  [/\bshemot\b/g, "shemos"],
  [/\bchayei\s+sara\b/g, "chayei sarah"],
  [/\bki\s+teitzei\b/g, "ki seitzei"],
  [/\bki\s+tavo\b/g, "ki savo"],
  [/\bhaazinu\b/g, "haazinu"],
];

export function toParshaComparableKey(value: string): string {
  let normalized = value
    .normalize("NFKD")
    .replace(PARSHA_PREFIX_RE, "")
    .replace(/[’'`]/g, "")
    .replace(/\s*-\s*/g, "-")
    .replace(/[^a-zA-Z\s-]/g, " ")
    .toLowerCase()
    .trim();

  for (const [pattern, replacement] of PARSHA_VARIANT_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/[\s-]+/g, "");
}

// ---------------------------------------------------------------------------
// Combined special weeks (e.g. "Shabbos Shuva Parshas Haazinu and Yom Kippur")
// ---------------------------------------------------------------------------
// Some weeks are announced with a single combined label that covers more than
// one stored collection. The homepage pool for such a week is the union of the
// component collections. This never unions arbitrary collections: only the
// parts explicitly named in the active label.

const COMBINED_SEPARATOR_RE = /\s+(?:and|&|\+|\/)\s+|,\s*/i;
// Descriptive Shabbos names that prefix a parsha rather than naming a
// collection of their own.
const SHABBOS_QUALIFIER_RE =
  /^(shabbos|shabbat)\s+(shuva|shuvah|teshuva|teshuvah|chazon|nachamu|hagadol|hagodol|shira|shirah|zachor|parah|hachodesh|mevorchim|rosh\s+chodesh)\s+/i;

/**
 * Expands a reading label into the comparable collection keys it covers.
 * Ordinary labels return a single key, so normal weeks are unchanged.
 */
export function toParshaComparableKeys(value: string): string[] {
  const keys: string[] = [];
  const push = (k: string) => {
    if (k && !keys.includes(k)) keys.push(k);
  };

  push(toParshaComparableKey(value));

  const parts = value.split(COMBINED_SEPARATOR_RE).filter((p) => p.trim().length > 0);
  if (parts.length > 1) {
    for (const part of parts) {
      const cleaned = part.trim().replace(SHABBOS_QUALIFIER_RE, "").trim();
      if (cleaned) push(toParshaComparableKey(cleaned));
      push(toParshaComparableKey(part.trim()));
    }
  }

  return keys.filter((k) => k.length > 0);
}
