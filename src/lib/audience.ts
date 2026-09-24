// Tolerates casing/synonym differences in the stored audience value.
// Titles that are unmistakably kid-oriented always resolve to "Children",
// even if the stored audience field was tagged incorrectly.
const KIDS_TITLE_HINTS = ["pirchei", "kids corner", "junior", "for kids", "kids "];

export type AudienceKey = "Children" | "Families" | "Adults";

export const AUDIENCE_LABELS: Record<AudienceKey, string> = {
  Children: "Children",
  Families: "Families",
  Adults: "Adults",
};

export function audienceLabel(
  key: "All" | AudienceKey | null | undefined,
): string | null {
  if (key === "All") return "All";
  if (!key) return null;
  return AUDIENCE_LABELS[key as AudienceKey] ?? key;
}


export function normalizeAudience(
  value: string | null,
  title?: string | null,
): AudienceKey | null {
  // Stored metadata is authoritative. Title hints are only a fallback for
  // rows with no audience tagged at all.
  const v = (value ?? "").trim().toLowerCase();
  if (!v) {
    const t = (title ?? "").trim().toLowerCase();
    return t && KIDS_TITLE_HINTS.some((h) => t.includes(h)) ? "Children" : null;
  }
  if (v.startsWith("child") || v.startsWith("kid") || v.startsWith("youth")) return "Children";
  if (v.startsWith("famil")) return "Families";
  if (v.startsWith("adult") || v.startsWith("teen")) return "Adults";
  return null;
}

