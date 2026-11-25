import { TFTT_ORIGINAL_SERIES } from "./tftt-originals";

/**
 * Editorial catalog, deliberately separate from canonical publication IDs.
 * Never invent IDs or match ownership by title. The three new series can be
 * promoted before a database record / published PDF has been verified.
 */
export type OriginalPromotionSeries = {
  key: string;
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
    key: "qa", publicationId: TFTT_ORIGINAL_SERIES[0].id,
    archiveQuery: TFTT_ORIGINAL_SERIES[0].title,
    title: "Parsha Questions & Answers",
    tagline: "How well do you know the Parsha?",
    brief: "Engaging Rashi-based questions and answers",
    description: "Engaging Rashi-based questions and answers that encourage participation, reinforce Parsha knowledge, and spark lively Shabbos table discussion.",
    audience: "Children · Families",
  },
  {
    key: "stories", publicationId: TFTT_ORIGINAL_SERIES[1].id,
    archiveQuery: TFTT_ORIGINAL_SERIES[1].title,
    title: "Stories for the Shabbos Table",
    tagline: "Stories that inspire. Lessons that last.",
    brief: "Meaningful stories with lessons to discuss",
    description: "Meaningful stories rooted in Torah sources, bringing timeless lessons and inspiration to the entire family.",
    audience: "Families",
  },
  {
    key: "margins", publicationId: TFTT_ORIGINAL_SERIES[2].id,
    archiveQuery: TFTT_ORIGINAL_SERIES[2].title,
    title: "In the Margins",
    tagline: "Discover what you may have overlooked.",
    brief: "Fresh perspectives from three classical Meforshim",
    description: "Fascinating and lesser-known insights from the Malbim, Ohr HaChaim, and Kli Yakar that reveal fresh perspectives on familiar pesukim.",
    audience: "Deeper Learning",
  },
  {
    key: "ramban", publicationId: TFTT_ORIGINAL_SERIES[3].id,
    archiveQuery: TFTT_ORIGINAL_SERIES[3].title,
    title: "Parsha Pearls from the Ramban",
    tagline: "Discover the depth of the Ramban.",
    brief: "Accessible insights from the Ramban",
    description: "Carefully selected insights from the Ramban’s commentary, presenting his profound understanding of the Torah in clear, accessible language.",
    audience: "Deeper Learning",
  },
  {
    key: "chizkuni", publicationId: null, archiveQuery: null,
    title: "Chizkuni Insights",
    tagline: "A fresh perspective on familiar pesukim.",
    brief: "Distinctive explanations of the Torah",
    description: "Discover the Chizkuni’s distinctive explanations of the Torah, illuminating its words, events, and apparent difficulties.",
    audience: "Deeper Learning",
  },
  {
    key: "medrash", publicationId: null, archiveQuery: null,
    title: "Treasures from the Medrash",
    tagline: "Ancient teachings. Timeless discoveries.",
    brief: "Remarkable teachings from the Medrash",
    description: "Explore remarkable teachings from the Medrash that illuminate the events of the Parsha and uncover layers of meaning beyond the pesukim.",
    audience: "Families · Deeper Learning",
  },
  {
    key: "questions", publicationId: null, archiveQuery: null,
    title: "Questions Beneath the Surface",
    tagline: "Look closer. Think deeper.",
    brief: "Challenging questions and source-based answers",
    description: "Challenging Parsha questions and carefully researched, source-based answers that encourage deeper understanding and meaningful discussion.",
    audience: "Deeper Learning",
  },
];

export function promotionSeriesById(id: string | null | undefined): OriginalPromotionSeries | undefined {
  return id ? ORIGINAL_PROMOTION_SERIES.find((series) => series.publicationId === id) : undefined;
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
  return "Discover seven Torah For The Table original weekly series, from Parsha questions and stories to insights from the Ramban, Chizkuni, Medrash, and classical Meforshim. Explore published editions and forthcoming series.";
}
