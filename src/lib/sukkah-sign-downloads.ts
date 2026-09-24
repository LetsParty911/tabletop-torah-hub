// Counts the two Sukkos Trust sign sizes from the canonical publication funnel.
// These signs have no publication record, so the site tracks them by the exact
// size-specific titles sent from SukkosTrustFeature (publicationTitle prop).
export const SUKKAH_SIGN_TITLES = {
  letter: "Sukkos Decoration — Trust in Hashem (8.5 × 11)",
  tabloid: "Sukkos Decoration — Trust in Hashem (11 × 17)",
} as const;

export type SukkahSignDownloads = { letter: number; tabloid: number; total: number };

export function countSukkahSignDownloads(
  publications: Array<{ id: string | null; title: string; downloadActions: number }>,
): SukkahSignDownloads {
  const sum = (title: string) =>
    publications
      .filter((p) => !p.id && p.title.trim() === title)
      .reduce((n, p) => n + p.downloadActions, 0);
  const letter = sum(SUKKAH_SIGN_TITLES.letter);
  const tabloid = sum(SUKKAH_SIGN_TITLES.tabloid);
  return { letter, tabloid, total: letter + tabloid };
}
