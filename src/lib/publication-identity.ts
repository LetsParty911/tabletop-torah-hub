// Stable identity for matching an uploaded PDF to a weekly checklist slot.
//
// Preferred: a foreign key (pdfs.publication_id / checklist_sources.publication_id
// -> publications.id). When BOTH sides carry an id, only the id is compared, so a
// typo, extra space, or punctuation change in a free-text title can never flip a
// published item to "Missing".
//
// Fallback (pre-migration rows, or rows not yet linked): a normalized title key.

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

/** All title-derived keys a row can be known by (title and/or legacy publication text). */
export function titleKeysOf(row: IdentityRow): string[] {
  return [row.title, row.publication]
    .map(normalizeTitleKey)
    .filter((k) => k.length > 0);
}

/** True when a PDF row fills a checklist source slot. */
export function matchesSource(pdf: IdentityRow, source: IdentityRow): boolean {
  const pdfId = pdf.publication_id ?? null;
  const srcId = source.publication_id ?? null;
  // Both linked: the FK is authoritative — never fall back to fuzzy titles.
  if (pdfId && srcId) return pdfId === srcId;
  const srcKeys = new Set(titleKeysOf(source));
  return titleKeysOf(pdf).some((k) => srcKeys.has(k));
}
