import { TFTT_ORIGINAL_SERIES, FORTHCOMING_TFTT_ORIGINALS } from "./tftt-originals";
import type { OriginalEditionGroup } from "./original-editions";

/**
 * Editorial catalog, deliberately separate from canonical publication IDs.
 * Never invent IDs or match ownership by title. The three new series can be
 * promoted before a database record / published PDF has been verified.
 */
export type OriginalPromotionSeries = {
  key: string;
  coverSrc: string;
  accentColor: string;
  publicationId: string | null;
  archiveQuery: string | null;
  title: string;
  tagline: string;
  brief: string;
  description: string;
  audience: string;
};

export const ORIGINAL_PROMOTION_SERIES: readonly OriginalPromotionSeries[] = [
  {
    key: "qa", coverSrc: "/original-series-covers/parsha-questions-and-answers.5a57741b75.webp", accentColor: "#24558a",
    publicationId: TFTT_ORIGINAL_SERIES[0].id,
    archiveQuery: TFTT_ORIGINAL_SERIES[0].title,
    title: "Parsha Questions & Answers",
    tagline: "How well do you know the Parsha?",
    brief: "Twenty Rashi-based questions for the whole table",
    description: "Twenty Rashi-based questions and answers make Parsha review interactive, giving children and families a way to learn and participate together.",
    audience: "Children · Families",
  },
  {
    key: "stories", coverSrc: "/original-series-covers/stories-for-the-shabbos-table.e003166510.webp", accentColor: "#8c211c",
    publicationId: TFTT_ORIGINAL_SERIES[1].id,
    archiveQuery: TFTT_ORIGINAL_SERIES[1].title,
    title: "Stories for the Shabbos Table",
    tagline: "Stories that inspire. Lessons that last.",
    brief: "Three Torah stories and discussion questions",
    description: "Three meaningful, source-based Torah stories, each with a discussion question that brings its lesson to the Shabbos table.",
    audience: "Families",
  },
  {
    key: "margins", coverSrc: "/original-series-covers/in-the-margins.cbb7bf4a37.webp", accentColor: "#37552c",
    publicationId: TFTT_ORIGINAL_SERIES[2].id,
    archiveQuery: TFTT_ORIGINAL_SERIES[2].title,
    title: "In the Margins",
    tagline: "Discover what you may have overlooked.",
    brief: "Overlooked insights from three classical Meforshim",
    description: "Discover overlooked insights from the Malbim, Ohr HaChaim and Kli Yakar, with a fresh perspective on familiar pesukim.",
    audience: "Deeper Learning",
  },
  {
    key: "ramban", coverSrc: "/original-series-covers/parsha-pearls-from-the-ramban.c561984dc6.webp", accentColor: "#102540",
    publicationId: TFTT_ORIGINAL_SERIES[3].id,
    archiveQuery: TFTT_ORIGINAL_SERIES[3].title,
    title: "Parsha Pearls from the Ramban",
    tagline: "Discover the depth of the Ramban.",
    brief: "The Ramban’s depth, explained clearly",
    description: "Delve into the Ramban’s commentary through carefully selected insights that make his profound ideas accessible.",
    audience: "Deeper Learning",
  },
  {
    key: "chizkuni", coverSrc: "/original-series-covers/chizkuni-insights.0a420aa941.webp", accentColor: "#662a75",
    publicationId: FORTHCOMING_TFTT_ORIGINALS.chizkuni.id,
    archiveQuery: FORTHCOMING_TFTT_ORIGINALS.chizkuni.id ? FORTHCOMING_TFTT_ORIGINALS.chizkuni.title : null,
    title: "Chizkuni Insights",
    tagline: "A fresh perspective on familiar pesukim.",
    brief: "A distinctive classical Mefaresh",
    description: "Explore the Chizkuni’s distinctive explanations of the Torah’s wording, events and apparent difficulties, bringing a lesser-known Mefaresh to your table.",
    audience: "Deeper Learning",
  },
  {
    key: "medrash", coverSrc: "/original-series-covers/treasures-from-the-medrash.fb7a7f51ff.webp", accentColor: "#a35b18",
    publicationId: FORTHCOMING_TFTT_ORIGINALS.medrash.id,
    archiveQuery: FORTHCOMING_TFTT_ORIGINALS.medrash.id ? FORTHCOMING_TFTT_ORIGINALS.medrash.title : null,
    title: "Treasures from the Medrash",
    tagline: "Ancient teachings. Timeless discoveries.",
    brief: "Teachings of Chazal behind the pesukim",
    description: "Discover remarkable teachings from the Medrash that illuminate the Parsha’s events and reveal layers of meaning beyond the pesukim.",
    audience: "Families · Deeper Learning",
  },
  {
    key: "questions", coverSrc: "/original-series-covers/questions-beneath-the-surface.3472e762bc.webp", accentColor: "#19656d",
    publicationId: FORTHCOMING_TFTT_ORIGINALS.questions.id,
    archiveQuery: FORTHCOMING_TFTT_ORIGINALS.questions.id ? FORTHCOMING_TFTT_ORIGINALS.questions.title : null,
    title: "Questions Beneath the Surface",
    tagline: "Look closer. Think deeper.",
    brief: "Deep questions and carefully researched answers",
    description: "Investigate challenging Parsha questions through carefully researched Torah sources and clear reasoning, for readers who want to think deeper.",
    audience: "Deeper Learning",
  },
];

export function promotionSeriesById(id: string | null | undefined): OriginalPromotionSeries | undefined {
  return id ? ORIGINAL_PROMOTION_SERIES.find((series) => series.publicationId === id) : undefined;
}

/**
 * Permanent public listing artwork policy. Match the canonical publication ID,
 * never a title or the weekly PDF ID. New issue uploads must not change these
 * covers. Historical edition archives and the actual PDF preview are exceptions.
 * Keep this UI selection separate from storage, PDF URLs, and issue thumbnails.
 */
export type ListingCoverContext = "listing" | "archive";

export function resolveListingCover(
  publicationId: string | null | undefined,
  thumbnailUrl?: string | null,
  smallThumbnailUrl?: string | null,
  context: ListingCoverContext = "listing",
) {
  const series = context === "listing" ? promotionSeriesById(publicationId) : undefined;
  return {
    series,
    src: series?.coverSrc ?? thumbnailUrl ?? null,
    smallSrc: series ? null : smallThumbnailUrl ?? null,
  };
}

export const NEW_ORIGINAL_SERIES = ORIGINAL_PROMOTION_SERIES.filter((series) =>
  ["chizkuni", "medrash", "questions"].includes(series.key),
);

/** A temporary launch callout stays off until the owner approves activation. */
export const ORIGINALS_LAUNCH_ENABLED = false;
export function canShowOriginalsLaunch(publishedIds: readonly string[]): boolean {
  return ORIGINALS_LAUNCH_ENABLED && NEW_ORIGINAL_SERIES.every((series) =>
    series.publicationId !== null && publishedIds.includes(series.publicationId),
  );
}

export function originalsPromotionDescription(): string {
  return "Discover seven original weekly series from Torah For The Table: Parsha questions, stories, classical Meforshim, Ramban, Chizkuni, Medrash and in-depth questions.";
}

/** Latest published edition by verified canonical publication ID, never title. */
export function latestPromotionEdition(series: OriginalPromotionSeries, groups: readonly OriginalEditionGroup[]) {
  if (!series.publicationId) return undefined;
  for (const group of groups) {
    const edition = group.editions.find((item) => item.seriesId === series.publicationId);
    if (edition) return { edition, group };
  }
  return undefined;
}

