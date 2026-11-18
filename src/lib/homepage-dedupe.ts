/** Remove items already shown as original-series cards, preserving order. */
export function excludeShownOriginals<T extends { id: string }>(items: readonly T[], shownIds: readonly string[]): T[] {
  if (shownIds.length === 0) return [...items];
  const shown = new Set(shownIds);
  return items.filter((item) => !shown.has(item.id));
}
