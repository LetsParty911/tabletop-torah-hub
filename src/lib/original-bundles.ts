import { ORIGINAL_PROMOTION_SERIES, type OriginalPromotionSeries } from "@/lib/originals-promotion";

export type OriginalBundleResource = {
  id: string;
  title: string;
  url: string;
  parsha_key: string | null;
  jewish_year?: number | null;
  publication_id?: string | null;
};

export type OriginalBundleItem = {
  series: OriginalPromotionSeries;
  resource: OriginalBundleResource | null;
};

export type OriginalBundle = {
  key: "children" | "family" | "deeper";
  title: string;
  description: string;
  items: OriginalBundleItem[];
  availableCount: number;
  isComplete: boolean;
};

const DEFINITIONS = [
  {
    key: "children",
    title: "Children's Bundle",
    description: "Questions and stories for young readers.",
    seriesKeys: ["qa", "stories"],
  },
  {
    key: "family",
    title: "Family Bundle",
    description: "Medrash and thoughtful questions to discuss together.",
    seriesKeys: ["medrash", "questions"],
  },
  {
    key: "deeper",
    title: "Deeper Learning Bundle",
    description: "Classical commentaries for further study.",
    seriesKeys: ["margins", "ramban", "chizkuni"],
  },
] as const;

function readingKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/^parshas\s+/, "");
}

/**
 * Match only canonical series IDs in the live, non-fallback homepage collection.
 * A different week, a missing reading key, or a title lookalike is never a substitute.
 */
export function currentOriginalBundles(
  resources: readonly OriginalBundleResource[],
  currentParshaKey: string | null,
  isFallback: boolean,
): OriginalBundle[] {
  const expectedKey = readingKey(currentParshaKey);
  const eligible = isFallback || !expectedKey ? [] : resources.filter((resource) =>
    readingKey(resource.parsha_key) === expectedKey,
  );

  return DEFINITIONS.map((definition) => {
    const items = definition.seriesKeys.map((seriesKey) => {
      const series = ORIGINAL_PROMOTION_SERIES.find((candidate) => candidate.key === seriesKey);
      if (!series) throw new Error(`Unknown original series key: ${seriesKey}`);
      const resource = series.publicationId
        ? eligible.find((candidate) => candidate.publication_id === series.publicationId) ?? null
        : null;
      return { series, resource };
    });
    const availableCount = items.filter((item) => item.resource !== null).length;
    return {
      key: definition.key,
      title: definition.title,
      description: definition.description,
      items,
      availableCount,
      isComplete: availableCount === items.length,
    };
  });
}

export function originalBundleFilename(bundle: OriginalBundle, collectionLabel: string): string {
  const clean = (value: string) => value
    .replace(/['’]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${clean(bundle.title)}-${clean(collectionLabel) || "Current-Week"}.pdf`;
}
