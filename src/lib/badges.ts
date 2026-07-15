export const CATEGORY_LABELS: Record<string, string> = {
  kids: "Kids",
  family: "Family",
  in_depth: "In-Depth",
  reference: "Halacha",
};

export const CATEGORY_KEYS = ["kids", "family", "in_depth", "reference"] as const;

export const PUBLICATION_LABELS: Record<string, string> = {
  tftt_original: "TFTT Original",
  mikaamcha: "Mi Ka'amcha Yisroel",
  peninei_mechkerei: "Peninei Mechkerei Eretz",
};

export const PUBLICATION_KEYS = [
  "tftt_original",
  "mikaamcha",
  "peninei_mechkerei",
] as const;

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

export const TAG_KEYS = Object.keys(TAG_LABELS);

// Map of normalized publication title -> publication key.
// Used at upload time to auto-suggest a publication based on the source/placement title.
const PUBLICATION_TITLE_MAP: Record<string, string> = {
  "torah for the table original": "tftt_original",
  "mi ka'amcha yisroel": "mikaamcha",
  "mi kaamcha yisroel": "mikaamcha",
  "mi ka'amcha yisrael": "mikaamcha",
  "peninei mechkerei eretz — harav hagaon rachamim moshe shayo, shlita": "peninei_mechkerei",
  "peninei mechkerei eretz": "peninei_mechkerei",
};

export function publicationForTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const key = title.trim().toLowerCase();
  return PUBLICATION_TITLE_MAP[key] ?? null;
}

export function categoryLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return CATEGORY_LABELS[key] ?? key;
}

export function publicationLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return PUBLICATION_LABELS[key] ?? key;
}

export function tagLabel(key: string): string {
  return TAG_LABELS[key] ?? key;
}
