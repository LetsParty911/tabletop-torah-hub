export type LengthFilter = "All" | "short" | "medium" | "long" | "study";

export const LENGTH_OPTIONS = [
  { key: "All", label: "All lengths" },
  { key: "short", label: "Under 5 Pages" },
  { key: "medium", label: "5–19 Pages" },
  { key: "study", label: "20+ Pages" },
] as const;

// Retain long for existing archive bookmarks; it deliberately overlaps study.
export function matchesPageLength(pages: number | null | undefined, value: LengthFilter): boolean {
  if (value === "All") return true;
  if (typeof pages !== "number" || !Number.isFinite(pages)) return false;
  if (value === "short") return pages < 5;
  if (value === "medium") return pages >= 5 && pages < 20;
  if (value === "study") return pages >= 20;
  return pages >= 5;
}