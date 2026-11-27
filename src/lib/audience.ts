// Tolerates casing/synonym differences in the stored audience value.
// Titles that are unmistakably kid-oriented always resolve to "Children",
// even if the stored audience field was tagged incorrectly.
import { FORTHCOMING_TFTT_ORIGINALS, TFTT_ORIGINAL_SERIES } from "./tftt-originals";

const KIDS_TITLE_HINTS = ["pirchei", "kids corner", "junior", "for kids", "kids "];

export type AudienceKey = "Children" | "Families" | "Adults";

export const AUDIENCE_LABELS: Record<AudienceKey, string> = {
  Children: "Children",
  Families: "Families",
  Adults: "Deeper Learning",
};

export function audienceLabel(
  key: "All" | AudienceKey | null | undefined,
): string | null {
  if (key === "All") return "All";
  if (!key) return null;
  return AUDIENCE_LABELS[key as AudienceKey] ?? key;
}


export function normalizeAudience(
  value: string | null | undefined,
  title?: string | null,
  publicationId?: string | null,
): AudienceKey | null {
  // Stored metadata is authoritative. Title hints are only a fallback for
  // rows with no audience tagged at all.
  const v = (value ?? "").trim().toLowerCase();
  if (!v) {
    // The registered Ramban series is editorially designated Deeper Learning.
    // Never infer ownership or classification from the title alone.
    if (publicationId === TFTT_ORIGINAL_SERIES[3].id) return "Adults";
    const t = (title ?? "").trim().toLowerCase();
    return t && KIDS_TITLE_HINTS.some((h) => t.includes(h)) ? "Children" : null;
  }
  if (v.startsWith("child") || v.startsWith("kid") || v.startsWith("youth")) return "Children";
  if (v.startsWith("famil")) return "Families";
  if (v.startsWith("adult") || v.startsWith("teen") || v === "deeper learning") return "Adults";
  return null;
}


// Editorially approved audiences for the original weekly series. Use the
// canonical publication ID, not the title; never reclassify a lookalike.
const SERIES_AUDIENCE_ENTRIES: [string | null, readonly AudienceKey[]][] = [
    [TFTT_ORIGINAL_SERIES[0].id, ["Children", "Families"]],
    [TFTT_ORIGINAL_SERIES[1].id, ["Children", "Families"]],
    [TFTT_ORIGINAL_SERIES[2].id, ["Adults"]],
    [TFTT_ORIGINAL_SERIES[3].id, ["Adults"]],
    [FORTHCOMING_TFTT_ORIGINALS.chizkuni.id, ["Adults"]],
    [FORTHCOMING_TFTT_ORIGINALS.medrash.id, ["Families", "Adults"]],
    [FORTHCOMING_TFTT_ORIGINALS.questions.id, ["Families", "Adults"]],
];
const SERIES_AUDIENCES: ReadonlyMap<string, readonly AudienceKey[]> = new Map(
  SERIES_AUDIENCE_ENTRIES.filter((entry): entry is [string, readonly AudienceKey[]] => entry[0] !== null),
);

/** Effective audience memberships; supports multiple labels without rewriting stored records. */
export function normalizeAudiences(
  value: string | null | undefined,
  title?: string | null,
  publicationId?: string | null,
): AudienceKey[] {
  const seriesAudiences = publicationId ? SERIES_AUDIENCES.get(publicationId) : undefined;
  if (seriesAudiences) return [...seriesAudiences];
  const parts = (value ?? "").split(/\s*(?:[,;·|/&]|\band\b)\s*/i).filter((part) => part.trim());
  if (!parts.length) parts.push("");
  const keys = parts
    .map((part) => normalizeAudience(part.trim().replace(/^for\s+/i, ""), title, publicationId))
    .filter((key): key is AudienceKey => key !== null);
  return [...new Set(keys)];
}

/** Human-readable labels shared by listing cards, archives and readers. */
export function audienceDisplay(
  value: string | null | undefined,
  title?: string | null,
  publicationId?: string | null,
): string | null {
  const keys = normalizeAudiences(value, title, publicationId);
  return keys.length ? keys.map((key) => AUDIENCE_LABELS[key]).join(" and ") : value?.trim() || null;
}
