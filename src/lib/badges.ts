export const CATEGORY_LABELS: Record<string, string> = {
  kids: "Kids",
  family: "Family",
  in_depth: "In-Depth",
  reference: "Reference",
};

export const TAG_LABELS: Record<string, string> = {
  stories: "Stories",
  halachah: "Halachah",
  hashkafah: "Hashkafah",
  mussar: "Mussar",
  chassidus: "Chassidus",
  textual: "Textual Analysis",
  practical: "Practical",
  discussion: "Discussion Starter",
  read_aloud: "Read Aloud",
  quick_read: "Quick Read",
  advanced: "Advanced",
};

export const CATEGORY_KEYS = ["kids", "family", "in_depth", "reference"] as const;

export function categoryLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return CATEGORY_LABELS[key] ?? key;
}

export function tagLabel(key: string): string {
  return TAG_LABELS[key] ?? key;
}
