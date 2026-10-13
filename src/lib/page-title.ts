// Keeps every document <title> within the ~60-character range search
// engines display. The site-brand suffix is always kept; an optional
// detail segment is dropped first, and the base is word-truncated last.

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
  if (base.length + detail.length + suffix.length <= MAX_TITLE) {
    return `${base}${detail}${suffix}`;
  }
  if (base.length + suffix.length <= MAX_TITLE) {
    return `${base}${suffix}`;
  }
  return `${clampStem(base + detail, MAX_TITLE - suffix.length)}${suffix}`;
}
