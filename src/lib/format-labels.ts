/**
 * Display labels for stored format/content type values.
 * "Brief Insights" is the user-facing name for brief, quick-read Torah.
 * Older stored values are normalized to this one public label.
 */
export function formatTypeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value === "Short Vorts" || value === "Brief Insights" ? "Brief Insights" : value;
}
