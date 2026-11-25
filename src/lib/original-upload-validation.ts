import { TFTT_ORIGINAL_EDITION_SERIES, TFTT_ORIGINAL_SERIES, type TfttOriginalSeries } from "./tftt-originals";

/** Exact reserved editorial titles, including the names previously used for
 * these same registered series. This is validation, not title-based ownership
 * attribution: only an explicitly selected canonical ID establishes ownership.
 * Do not classify arbitrary similar outside titles as TFTT originals. */
function normalize(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}
const reservedTitles = new Map<string, TfttOriginalSeries>(
  TFTT_ORIGINAL_EDITION_SERIES.map(series => [normalize(series.title), series]),
);
const alias = (title: string, id: string) => {
  const series = TFTT_ORIGINAL_EDITION_SERIES.find(s => s.id === id);
  if (series) reservedTitles.set(normalize(title), series);
};
alias("Parsha Challenge", TFTT_ORIGINAL_SERIES[0].id);
alias("Parsha Questions and Answers", TFTT_ORIGINAL_SERIES[0].id);
alias("Parsha Pearls from the Ramban", TFTT_ORIGINAL_SERIES[3].id);
alias("Parsha Pearls on the Ramban", TFTT_ORIGINAL_SERIES[3].id);
alias("Treasures of the Medrash", TFTT_ORIGINAL_EDITION_SERIES.find(s => s.title === "Treasures from the Medrash")?.id ?? "");

export function requiredOriginalSeries(title: string): TfttOriginalSeries | undefined {
  return reservedTitles.get(normalize(title));
}

function displayName(series: TfttOriginalSeries): string {
  return series.id === TFTT_ORIGINAL_SERIES[3].id ? "Parsha Pearls from the Ramban" : series.title;
}

export function originalPublicationError(title: string, publicationId: string | null | undefined): string | null {
  const expected = requiredOriginalSeries(title);
  if (!expected || expected.id === publicationId) return null;
  return `Select "${displayName(expected)}" from the Publication list before saving. This original must be linked to its registered series.`;
}

/** Existing holiday or historical editions can have nonstandard titles.
 * Do not silently remove their already-verified original association. */
export function originalPublicationEditError(
  current: { title: string; publication_id: string | null },
  next: { title: string; publication_id: string | null },
): string | null {
  const titleError = originalPublicationError(next.title, next.publication_id);
  if (titleError) return titleError;
  const original = TFTT_ORIGINAL_EDITION_SERIES.find(s => s.id === current.publication_id);
  if (original && next.publication_id !== original.id) {
    // Allow an explicit repair to a different registered series when the
    // resulting reserved title identifies that exact series; never detach.
    const expected = requiredOriginalSeries(next.title);
    if (expected && next.publication_id === expected.id) return null;
    return `Keep this original linked to "${displayName(original)}". Its publication association cannot be removed.`;
  }
  return null;
}
