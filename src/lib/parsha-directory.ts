import { PARSHIYOS, YOM_TOV_KEYS } from "./parshiyos";
import { readingSlug } from "./reading-page";

/**
 * Canonical permanent Parsha pages. Include combined readings in the archive,
 * but exclude Yom Tov: holiday material has its own year-specific route.
 *
 * This map is shared by the archive directory and sitemap so their links agree.
 */
export const DIRECTORY_PARSHIYOS = PARSHIYOS.filter((key) => !YOM_TOV_KEYS.includes(key));

const CANONICAL_BY_SLUG = new Map(DIRECTORY_PARSHIYOS.map((key) => [readingSlug(key), key]));

export function canonicalParshaForSlug(slug: string): string | null {
  return CANONICAL_BY_SLUG.get(slug) ?? null;
}

export function isDirectoryParshaSlug(slug: string): boolean {
  return CANONICAL_BY_SLUG.has(slug);
}
