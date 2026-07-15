export const CATEGORY_LABELS: Record<string, string> = {
  kids: "Kids",
  family: "Family",
  in_depth: "In-Depth",
  reference: "Halacha",
  tftt_original: "TFTT Original",
  mikaamcha: "Mi Ka'amcha Yisroel",
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

export const CATEGORY_KEYS = [
  "kids",
  "family",
  "in_depth",
  "reference",
  "tftt_original",
  "mikaamcha",
] as const;

// Map of normalized publication title -> primary_category key.
// Used at upload time to auto-assign a category based on the source/placement title.
const PUBLICATION_CATEGORY: Record<string, string> = {
  "torah for the table original": "tftt_original",
  "mi ka'amcha yisroel": "mikaamcha",
  "mi kaamcha yisroel": "mikaamcha",
  "mi ka'amcha yisrael": "mikaamcha",
};

export function categoryForTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const key = title.trim().toLowerCase();
  return PUBLICATION_CATEGORY[key] ?? null;
}

export function categoryLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return CATEGORY_LABELS[key] ?? key;
}

export function tagLabel(key: string): string {
  return TAG_LABELS[key] ?? key;
}
