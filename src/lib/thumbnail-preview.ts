/** Only bundled, known-existing copies are eligible. Storage derivatives stay
 * disabled until an authoritative availability source/backfill is approved. */
export function smallThumbnailUrl(source: string | null | undefined): string | null {
  if (!source) return null;
  if (source === "/publication-covers/torah-wellsprings-plaque-v2.jpg") return "/publication-covers/torah-wellsprings-small.webp";
  if (source === "/publication-covers/mi-kaamcha-yisroel-permanent.jpg") return "/publication-covers/mi-kaamcha-yisroel-small.webp";
  return null;
}