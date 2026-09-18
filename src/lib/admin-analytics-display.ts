export function shouldShowRate(denominator: number): boolean {
  return denominator >= 10;
}

export function formatCountRate(numerator: number, denominator: number): string {
  if (!shouldShowRate(denominator)) return `${numerator} of ${denominator}`;
  return `${Math.round((numerator / denominator) * 100)}% · ${numerator} of ${denominator}`;
}

export function normalizeTrackingValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildTrackingUrl(input: {
  baseUrl: string;
  source: string;
  medium: string;
  campaign: string;
}): string | null {
  try {
    const url = new URL(input.baseUrl);
    const source = normalizeTrackingValue(input.source);
    const medium = normalizeTrackingValue(input.medium);
    const campaign = normalizeTrackingValue(input.campaign);
    if (!source || !medium || !campaign) return null;
    url.searchParams.set("utm_source", source);
    url.searchParams.set("utm_medium", medium);
    url.searchParams.set("utm_campaign", campaign);
    return url.toString();
  } catch {
    return null;
  }
}