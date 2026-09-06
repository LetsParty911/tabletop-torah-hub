// Stable identity for matching an uploaded PDF to a weekly checklist slot.
//
// Preferred: a foreign key (pdfs.publication_id / checklist_sources.publication_id
// -> publications.id). Approved holiday aliases are an explicit exception: a
// holiday-specific publication may intentionally have a different publication_id
// while still filling the same recurring checklist slot.

export type IdentityRow = {
  publication_id?: string | null;
  title?: string | null;
  publication?: string | null;
};

/** Lowercase and strip everything but letters/digits so "R' Yehuda" === "R'Yehuda". */
export const normalizeTitleKey = (value: string | null | undefined): string =>
  (value ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9]+/g, "");

// Approved holiday-specific display titles that fill an existing weekly
// checklist slot. The checklist keeps one stable canonical source name while
// the PDF itself may use a Yom Tov-specific title.
const TITLE_KEY_ALIASES: Record<string, string> = {
  roshhashanahqa: "parshaquestionsanswers",
  roshhashanahquestionsanswers: "parshaquestionsanswers",
  storiesfortheyomtovtable: "storiesfortheshabbostable",
};

function canonicalTitleKey(value: string | null | undefined): string {
  const key = normalizeTitleKey(value);
  return TITLE_KEY_ALIASES[key] ?? key;
}

function hasApprovedAlias(row: IdentityRow): boolean {
  return [row.title, row.publication].some((value) => {
    const rawKey = normalizeTitleKey(value);
    return Boolean(rawKey && TITLE_KEY_ALIASES[rawKey]);
  });
}

/** All title-derived keys a row can be known by (title and/or legacy publication text). */
export function titleKeysOf(row: IdentityRow): string[] {
  return [row.title, row.publication]
    .map(canonicalTitleKey)
    .filter((k) => k.length > 0);
}

/** True when a PDF row fills a checklist source slot. */
export function matchesSource(pdf: IdentityRow, source: IdentityRow): boolean {
  const pdfId = pdf.publication_id ?? null;
  const srcId = source.publication_id ?? null;

  // Same stable publication identity is always a match.
  if (pdfId && srcId && pdfId === srcId) return true;

  // Different linked publications normally remain distinct. The only exception
  // is an explicitly approved alias (for example a Yom Tov-specific edition).
  if (pdfId && srcId && !hasApprovedAlias(pdf) && !hasApprovedAlias(source)) {
    return false;
  }

  const srcKeys = new Set(titleKeysOf(source));
  return titleKeysOf(pdf).some((k) => srcKeys.has(k));
}
