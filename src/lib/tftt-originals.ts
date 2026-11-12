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
  return TFTT_ORIGINAL_EDITION_SERIES.find((series) => series.id === publicationId) ?? null;
}

export type TfttOriginalSeries = {
  id: string;
  title: string;
  shortDescription: string;
  expectation: string;
};

/**
 * Verified canonical public.publications id for "The Parsha Detective".
 * Registered as an active original series; no edition is public until a
 * source-approved PDF is uploaded and explicitly published.
 * Never infer ownership from publication titles.
 */
export const PARSHA_DETECTIVE_PUBLICATION_ID: string | null = "20900013-b70f-4091-8026-d5a05131ded8";

export const PARSHA_DETECTIVE_SERIES_COPY = {
  title: "The Parsha Detective",
  shortDescription:
    "Illustrated six-panel Torah mysteries for children and families to solve together at the Shabbos table.",
  expectation: "Illustrated Torah mysteries for children and families.",
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Series eligible for the /originals edition listing. Always the three
 * existing weekly series; The Parsha Detective is appended only when a
 * well-formed, non-duplicate canonical id is configured.
 */
export function buildOriginalEditionSeries(detectiveId: string | null | undefined): readonly TfttOriginalSeries[] {
  const base: TfttOriginalSeries[] = TFTT_ORIGINAL_SERIES.map((s) => ({ ...s }));
  const id = detectiveId?.trim().toLowerCase();
  if (!id || !UUID_RE.test(id) || id === NIL_UUID || base.some((s) => s.id === id)) return base;
  return [...base, { id, ...PARSHA_DETECTIVE_SERIES_COPY }];
}

/** /originals edition series (scoped: homepage starters, chooser and publication pages still use TFTT_ORIGINAL_SERIES). */
export const TFTT_ORIGINAL_EDITION_SERIES = buildOriginalEditionSeries(PARSHA_DETECTIVE_PUBLICATION_ID);
