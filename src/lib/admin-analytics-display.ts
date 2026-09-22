import { normalizeUtmValue, withUtm } from "@/lib/utm";

export function shouldShowRate(denominator: number): boolean {
  return denominator >= 10;
}

export function formatCountRate(numerator: number, denominator: number): string {
  if (!shouldShowRate(denominator)) return `${numerator} of ${denominator}`;
  return `${Math.round((numerator / denominator) * 100)}% · ${numerator} of ${denominator}`;
}

export const normalizeTrackingValue = normalizeUtmValue;

export function buildTrackingUrl(input: {
  baseUrl: string;
  source: string;
  medium: string;
  campaign: string;
}): string | null {
  try {
    // Validate the base URL before tagging it.
    new URL(input.baseUrl);
  } catch {
    return null;
  }
  if (
    !normalizeUtmValue(input.source) ||
    !normalizeUtmValue(input.medium) ||
    !normalizeUtmValue(input.campaign)
  )
    return null;
  return withUtm(
    input.baseUrl,
    { source: input.source, medium: input.medium, campaign: input.campaign },
    { replace: true },
  );
}