/**
 * Canonical TFTT-owned weekly series.
 *
 * IDs are taken from public.publications. Do not infer ownership from a
 * matching title or publisher display string: third-party and historical
 * records may have similar names.
 */
export const TFTT_ORIGINAL_SERIES = [
  {
    id: "0fa3db5f-c153-4311-a007-415c3c022143",
    title: "Parsha Challenge",
    shortDescription: "Questions based on Rashi to get children and adults involved at the Shabbos table.",
    expectation: "Questions and answers based on Rashi.",
  },
  {
    id: "88719788-42fb-4e0b-a34b-3ea1868e750d",
    title: "Stories for the Shabbos Table",
    shortDescription: "Source-based stories from Chazal and Tanach, with questions to discuss at the Shabbos table.",
    expectation: "A Torah-source story and a question for the table.",
  },
  {
    id: "86d9b1b2-cebf-42e5-b623-dfc1b5c5b411",
    title: "In the Margins",
    shortDescription: "A short, thoughtful parsha insight to read, consider, and share at your Shabbos table.",
    expectation: "One concise insight on the parsha.",
  },
] as const;

export function tfttOriginalSeriesById(publicationId: string | null | undefined) {
  if (!publicationId) return null;
  return TFTT_ORIGINAL_SERIES.find((series) => series.id === publicationId) ?? null;
}
