/**
 * Pure helpers for the public weekly-collection status and PDF action links.
 * The collection counts as finished only when the admin progress meter reads
 * 100% AND the live (non-fallback) collection actually has published items.
 */
export function isCollectionComplete(
  fillStep: number | null | undefined,
  isFallback: boolean,
  publishedCount: number,
): boolean {
  return fillStep === 100 && !isFallback && publishedCount > 0;
}

/** Visitor-facing count line: never says "more coming" once complete. */
export function collectionCountLine(count: number, complete: boolean): string {
  const noun = count === 1 ? "Dvar Torah" : "Divrei Torah";
  return complete
    ? `All ${count} ${noun} are posted — this week's collection is complete.`
    : `${count} ${count === 1 ? "Dvar Torah is" : "Divrei Torah are"} already posted — more coming.`;
}

/** Existing server routes: inline viewer and attachment download. */
export function pdfActionHrefs(publicationId: string) {
  const id = encodeURIComponent(publicationId);
  return { open: `/view/${id}/pdf`, download: `/view/${id}/download` };
}

/** "Questions & Answers" content type always wins over brief-insight format labels. */
export function displayContentType(
  contentType: string | null | undefined,
  formatType: string | null | undefined,
  formatLabel: (v: string | null | undefined) => string | null,
): string | null {
  if (contentType === "Questions & Answers") return "Questions & Answers";
  return formatLabel(formatType) ?? formatLabel(contentType);
}
