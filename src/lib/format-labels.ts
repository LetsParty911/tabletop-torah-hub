/**
 * Display labels for stored format/content type values.
 * "Short Vorts" is stored in the database for historical reasons but must
 * never be shown as a content-type label — it now reads "Brief Insights".
 * (The Short Vorts page and its nav link keep their own name.)
 */
export function formatTypeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value === "Short Vorts" ? "Brief Insights" : value;
}
