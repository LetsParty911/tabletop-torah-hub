// Preserve the unique subject of each document in its SEO title.
// ~60 characters is a display target, not a reason to remove the parsha
// or article name merely to retain the site-brand suffix.

const MAX_TITLE = 60;
const SITE_SUFFIX = " | Torah For The Table";

const clampStem = (stem: string, budget: number): string => {
  if (stem.length <= budget) return stem;
  const cut = stem.slice(0, budget - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > budget * 0.5 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

export function fitPageTitle(
  base: string,
  detail = "",
  suffix: string = SITE_SUFFIX,
): string {
  const fullTitle = `${base}${detail}`.trim();
  if (fullTitle.length + suffix.length <= MAX_TITLE) return `${fullTitle}${suffix}`;
  // Optional detail may be omitted only when the base is still informative.
  if (detail && base.length + suffix.length <= MAX_TITLE) return `${base}${suffix}`;
  // Prefer the complete, distinctive title to a branded but ambiguous fragment.
  if (fullTitle.length <= MAX_TITLE) return fullTitle;
  return clampStem(fullTitle, MAX_TITLE);
}
