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

/**
 * The loader owns the displayed parsha label and fallback identity. If the
 * client refresh observes a different collection (e.g. newly published PDFs
 * replace last week's fallback), invalidate the entire route before showing
 * those resources. Otherwise the heading and WhatsApp share text can continue
 * to identify last week's collection while the cards show the new week.
 */
export function hasDisplayedCollectionChanged(
  previous: { isFallback: boolean; fallbackParshaKey: string | null },
  latest: { isFallback: boolean; fallbackParshaKey: string | null },
): boolean {
  return previous.isFallback !== latest.isFallback ||
    (latest.isFallback && previous.fallbackParshaKey !== latest.fallbackParshaKey);
}

/** Only a current-week ETA binds unscoped legacy progress to this reading. */
export function isProgressForReading(eta: string | null | undefined, readingDate: string | null): boolean {
  if (!eta || !readingDate) return false;
  const date = new Date(eta);
  const reading = new Date(`${readingDate}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(reading.getTime())) return false;
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  reading.setUTCDate(reading.getUTCDate() - 6);
  return local >= reading.toISOString().slice(0, 10) && local <= readingDate;
}

/** Historical PDFs for the same parsha are not evidence of this year's release. */
export function currentYearRows<T extends { parsha_key: string; jewish_year: number | null }>(rows: T[], comparableKeys: string[], year: number | null, normalize: (key: string) => string): T[] {
  if (!year) return [];
  const wanted = new Set(comparableKeys);
  return rows.filter(row => row.jewish_year === year && wanted.has(normalize(row.parsha_key)));
}
