// Tolerates casing/synonym differences in the stored audience value.
// Titles that are unmistakably kid-oriented always resolve to "Children",
// even if the stored audience field was tagged incorrectly.
const KIDS_TITLE_HINTS = ["pirchei", "kids corner", "junior", "for kids", "kids "];

export type AudienceKey = "Children" | "Families" | "Adults";

export const AUDIENCE_LABELS: Record<AudienceKey, string> = {
  Children: "Children",
  Families: "Families",
  Adults: "Parents/Adults",
};

export function audienceLabel(
  key: "All" | AudienceKey | null | undefined,
): string | null {
  if (key === "All") return "All";
  if (!key) return null;
  return AUDIENCE_LABELS[key as AudienceKey] ?? key;
}

// Tolerates casing/synonym differences in the stored audience value.
// Titles that are unmistakably kid-oriented always resolve to "Children",
// even if the stored audience field was tagged incorrectly.
const KIDS_TITLE_HINTS = ["pirchei", "kids corner", "junior", "for kids", "kids "];

export function normalizeAudience(
  value: string | null,
  title?: string | null,
): AudienceKey | null {
  const t = (title ?? "").trim().toLowerCase();
  if (t && KIDS_TITLE_HINTS.some((h) => t.includes(h))) return "Children";
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith("child") || v.startsWith("kid") || v.startsWith("youth")) return "Children";
  if (v.startsWith("famil")) return "Families";
  if (v.startsWith("adult") || v.startsWith("teen")) return "Adults";
  return null;
}

