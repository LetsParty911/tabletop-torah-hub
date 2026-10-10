// Pilot deliberately restricted to two Torah For The Table original Bereishis PDFs.
// Third-party contributor text is not eligible for republishing through this tool.
export const BEREISHIS_ORIGINAL_PILOT = [
  {
    id: "c524fb33-df9f-4b00-8a86-ba22027e5777",
    publicationId: "0fa3db5f-c153-4311-a007-415c3c022143",
    title: "Parsha Questions & Answers",
  },
  {
    id: "859684a4-4487-450a-9928-8c5dccae8158",
    publicationId: "88719788-42fb-4e0b-a34b-3ea1868e750d",
    title: "Stories for the Shabbos Table",
  },
] as const;

export type OriginalPdfEligibilityRow = {
  id: string;
  publication_id: string | null;
  parsha_key: string;
  jewish_year: number | null;
  published: boolean;
  file_path: string;
};

export function getBereishisPilotOriginal(id: string) {
  return BEREISHIS_ORIGINAL_PILOT.find((item) => item.id === id) ?? null;
}

export function isEligibleBereishisOriginal(row: OriginalPdfEligibilityRow): boolean {
  const pilot = getBereishisPilotOriginal(row.id);
  return (
    pilot !== null &&
    row.published === true &&
    row.parsha_key === "Bereishis" &&
    row.jewish_year === 5787 &&
    row.publication_id === pilot.publicationId &&
    typeof row.file_path === "string" &&
    row.file_path.length > 0
  );
}

// Preserve the author's words and paragraph breaks. Do not rewrite, spellcheck,
// summarize or silently normalize Hebrew/transliteration during ingestion.
export function preserveReviewedArticleText(input: string): string {
  return input.replace(/\r\n?/g, "\n").trim();
}
