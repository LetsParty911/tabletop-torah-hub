/** Re-key counts by their public label, adding counts that share a label (e.g. "Adult" and "Adults"). */
export function mergeLabelCounts(counts: Record<string, number>, toLabel: (raw: string) => string): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const [raw, count] of Object.entries(counts)) {
    const label = toLabel(raw);
    merged[label] = (merged[label] ?? 0) + count;
  }
  return merged;
}
