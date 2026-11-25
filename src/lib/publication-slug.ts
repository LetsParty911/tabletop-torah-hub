import { FORTHCOMING_TFTT_ORIGINALS, TFTT_ORIGINAL_SERIES, renameLegacySeriesText, tfttOriginalSeriesById } from "./tftt-originals";

export function publicationSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[’'`]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

type PublicationIdentity = { id: string; name: string };

/** Keep all public names and URLs keyed to the same registered publication ID. */
export function canonicalPublicationName(publication: PublicationIdentity): string {
  return tfttOriginalSeriesById(publication.id)?.title ?? renameLegacySeriesText(publication.name);
}

export function canonicalPublicationSlug(publication: PublicationIdentity): string {
  return publicationSlug(canonicalPublicationName(publication));
}

/** Retain known former series URLs even after their stored names are updated. */
const LEGACY_ORIGINAL_SLUGS: Readonly<Record<string, string | null>> = {
  "parsha-challenge": TFTT_ORIGINAL_SERIES[0].id,
  "parsha-pearls": TFTT_ORIGINAL_SERIES[3].id,
  "parsha-pearls-on-the-ramban": TFTT_ORIGINAL_SERIES[3].id,
  "treasures-of-the-medrash": FORTHCOMING_TFTT_ORIGINALS.medrash.id,
};

export function findPublicationBySlug<T extends PublicationIdentity>(
  publications: readonly T[],
  slug: string,
): T | undefined {
  return publications.find((p) => canonicalPublicationSlug(p) === slug)
    ?? publications.find((p) => publicationSlug(p.name) === slug)
    ?? publications.find((p) => LEGACY_ORIGINAL_SLUGS[slug] === p.id);
}
