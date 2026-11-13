/** Recurring upload slots keep stable labels, while readers see each PDF title. */
const INDIVIDUAL_TITLED_SERIES = new Set([
  "4d5f000c-6e90-4d58-aa9f-fd73fc005115",
  "c3fa24ef-b7a8-42d1-a237-480bc24cba57",
  "6a7d9744-96ef-4728-b329-eb7a4b2dba32",
  "3213db01-2e86-49bc-9ef1-16f977c02336",
]);

export function usesIndividualPdfTitle(publicationId: string | null | undefined): boolean {
  return !!publicationId && INDIVIDUAL_TITLED_SERIES.has(publicationId);
}

export function pdfDisplayTitle(
  storedTitle: string | null | undefined,
  canonicalName: string | null | undefined,
  publicationId: string | null | undefined,
): string {
  const uploadedTitle = storedTitle?.trim() ?? "";
  if (usesIndividualPdfTitle(publicationId) && uploadedTitle) {
    return uploadedTitle;
  }
  return canonicalName?.trim() || uploadedTitle;
}
