/** Choose the most recent *actual* UTC date known for a sitemap URL.
 * Missing source timestamps stay missing; never substitute the current date.
 * Inputs are normalized YYYY-MM-DD values from toLastmod.
 */
export function latestSitemapDate(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  if (!current || candidate > current) return candidate;
  return current;
}
