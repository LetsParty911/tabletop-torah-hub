/** Keep series labels for uploads, but show the authored title of each
 * Rabbi Yehuda Zev Klein Dvar Torah. Both publication IDs are recurring upload
 * slots: their names ("Dvar Torah 1/2") are not individual article titles. */
const INDIVIDUAL_TITLED_SERIES = new Set([
  "4d5f000c-6e90-4d58-aa9f-fd73fc005115",
  "c3fa24ef-b7a8-42d1-a237-480bc24cba57",
]);

export function pdfDisplayTitle(
  storedTitle: string | null | undefined,
  canonicalName: string | null | undefined,
  publicationId: string | null | undefined,
): string {
  const uploadedTitle = storedTitle?.trim() ?? "";
  if (publicationId && INDIVIDUAL_TITLED_SERIES.has(publicationId) && uploadedTitle) {
    return uploadedTitle;
  }
  return canonicalName?.trim() || uploadedTitle;
}
