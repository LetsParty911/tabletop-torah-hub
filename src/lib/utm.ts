/**
 * Central helper for adding UTM attribution to our own canonical links.
 *
 * Rules:
 * - Preserves every non-UTM query parameter and the hash.
 * - Never overwrites an existing utm_source/utm_medium/utm_campaign unless
 *   the caller explicitly asks for replacement (inbound attribution wins).
 * - Normalizes generated values consistently (lowercase, hyphenated).
 */

export type UtmParams = {
  source: string;
  medium: string;
  campaign: string;
};

export function normalizeUtmValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Returns the url with UTM parameters applied, or the original string when the
 * url cannot be parsed or the normalized values are empty.
 */
export function withUtm(
  url: string,
  params: UtmParams,
  options: { replace?: boolean } = {},
): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const values: Array<[string, string]> = [
    ["utm_source", normalizeUtmValue(params.source)],
    ["utm_medium", normalizeUtmValue(params.medium)],
    ["utm_campaign", normalizeUtmValue(params.campaign)],
  ];
  if (values.some(([, value]) => !value)) return url;

  for (const [key, value] of values) {
    const existing = parsed.searchParams.get(key);
    if (existing && existing.trim() && !options.replace) continue;
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}
