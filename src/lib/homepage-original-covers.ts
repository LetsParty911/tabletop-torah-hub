/** Hide discovery artwork only when every canonical series has a visible weekly card. */
export function hasAllOriginalCovers(
  visible: ReadonlyArray<{ publication_id?: string | null }>,
  series: ReadonlyArray<{ publicationId: string | null }>,
): boolean {
  return series.length > 0 && series.every((item) => item.publicationId !== null && visible.some((row) => row.publication_id === item.publicationId));
}
