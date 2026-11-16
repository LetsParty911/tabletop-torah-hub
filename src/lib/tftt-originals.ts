/**
 * Canonical CURRENT Torah For The Table weekly series.
 * IDs are real public.publications primary keys. Never identify ownership
 * by publication title alone: stored titles and historic editions can differ.
 */
export type TfttOriginalSeries = {
  id: string;
  title: string;
  shortDescription: string;
  expectation: string;
};

export const TFTT_ORIGINAL_SERIES = [
  {
    id: "0fa3db5f-c153-4311-a007-415c3c022143",
    title: "Parsha Questions & Answers",
    shortDescription: "Twenty parsha questions with answers sourced from Rashi, for participation around the Shabbos table.",
    expectation: "Twenty Rashi-based questions and answers for the whole table.",
  },
  {
    id: "88719788-42fb-4e0b-a34b-3ea1868e750d",
    title: "Stories for the Shabbos Table",
    shortDescription: "Three source-based stories from Chazal and Tanach, each with a question for the Shabbos table.",
    expectation: "Three Torah-source stories, each ending with a question to discuss.",
  },
  {
    id: "86d9b1b2-cebf-42e5-b623-dfc1b5c5b411",
    title: "In the Margins",
    shortDescription: "Three classic commentaries on the parsha, with a thought and question for the table.",
    expectation: "Three insights from classical mefarshim and a question for the table.",
  },
  {
    id: "81b9fadd-3f96-43a2-b21d-6619567e8b1b",
    title: "Parsha Pearls",
    shortDescription: "One Ramban fully unpacked, with one meaningful question for the Shabbos table.",
    expectation: "One Ramban, fully unpacked, and one question for the table.",
  },
] as const satisfies readonly TfttOriginalSeries[];

/** The active four series used for all homepage and /originals edition grids. */
export const TFTT_ORIGINAL_EDITION_SERIES: readonly TfttOriginalSeries[] = TFTT_ORIGINAL_SERIES;

/**
 * Legacy detective editions remain in the archive and may appear in a
 * last-week fallback collection. They are no longer part of the active four.
 * Never delete/rewrite historic publication IDs or analytics.
 */
export const PARSHA_DETECTIVE_PUBLICATION_ID = "20900013-b70f-4091-8026-d5a05131ded8";
export const PARSHA_DETECTIVE_SERIES_COPY = {
  title: "The Parsha Detective",
  shortDescription: "Illustrated Torah mysteries from earlier editions.",
  expectation: "Illustrated Torah mysteries for children and families.",
} as const;

/** Reader-facing legacy title normalization; PDFs and analytics stay untouched. */
export function renameLegacySeriesText<T extends string | null | undefined>(value: T): T {
  return (typeof value === "string"
    ? value.replace(/\bParsha Challenge\b/gi, TFTT_ORIGINAL_SERIES[0].title)
    : value) as T;
}

/** Ownership label lookup includes archived Detective only for historical attribution. */
export function tfttOriginalSeriesById(publicationId: string | null | undefined): TfttOriginalSeries | null {
  if (!publicationId) return null;
  const current = TFTT_ORIGINAL_SERIES.find((series) => series.id === publicationId);
  if (current) return current;
  return publicationId === PARSHA_DETECTIVE_PUBLICATION_ID
    ? { id: PARSHA_DETECTIVE_PUBLICATION_ID, ...PARSHA_DETECTIVE_SERIES_COPY }
    : null;
}
