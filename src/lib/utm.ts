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
  /**
   * Optional creative/message variant inside one campaign (utm_content).
   * Existing callers can omit it; when omitted nothing is added or removed.
   */
  content?: string;
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
 * url cannot be parsed or the normalized required values are empty.
 *
 * utm_content is optional: an empty or missing value leaves the url's own
 * utm_content untouched.
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

  const content = normalizeUtmValue(params.content ?? "");
  if (content) values.push(["utm_content", content]);

  for (const [key, value] of values) {
    const existing = parsed.searchParams.get(key);
    if (existing && existing.trim() && !options.replace) continue;
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}
