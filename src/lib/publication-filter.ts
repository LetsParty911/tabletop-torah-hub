/** Reader-facing publication/source facet.
 *
 * R' Yehuda Zev Klein has two distinct recurring weekly upload slots (Dvar
 * Torah 1 and 2), but readers should see one author filter. Some older PDFs
 * predate canonical publication IDs and can only be recognized by a clearly
 * spelled author credit in their uploaded title.
 *
 * Do not mutate the canonical upload identities or individual essay titles.
 */
export const KLEIN_PUBLICATION_FILTER = "R' Yehuda Zev Klein";

const KLEIN_UPLOAD_SLOT_IDS = new Set([
  "4d5f000c-6e90-4d58-aa9f-fd73fc005115",
  "c3fa24ef-b7a8-42d1-a237-480bc24cba57",
]);

const normalized = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function hasKleinByline(title: string | null | undefined): boolean {
  const key = normalized(title);
  return ["ryehudazevklein", "rabbiyehudazevklein", "ryzklein"]
    .some((byline) => key.includes(byline));
}

export type PublicationFilterResource = {
  publication_id?: string | null;
  publication?: string | null;
  title?: string | null;
};

export function publicationFilterName(r: PublicationFilterResource): string | null {
  const publicationId = r.publication_id ?? "";
  const publication = r.publication?.trim() ?? "";
  const publicationKey = normalized(publication);

  if (
    KLEIN_UPLOAD_SLOT_IDS.has(publicationId) ||
    /^ryehudazevkleindvartorah[12]$/.test(publicationKey) ||
    // Historical PDFs may have no canonical series. Require an explicit
    // author byline, not merely the surname "Klein".
    (!publicationId && !publication && hasKleinByline(r.title))
  ) {
    return KLEIN_PUBLICATION_FILTER;
  }

  return publication || null;
}
