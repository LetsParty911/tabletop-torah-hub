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
