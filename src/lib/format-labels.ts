/**
 * Display labels for stored format/content type values.
 * "Short Vorts" is the user-facing term for brief, quick-read Torah; the older
 * "Brief Insights" content-type value is shown under the same label so the
 * filters list one concept once.
 */
export function formatTypeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value === "Brief Insights" ? "Short Vorts" : value;
}
