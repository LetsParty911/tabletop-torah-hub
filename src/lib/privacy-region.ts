// Region rules for enhanced (fingerprint-based) analytics.
//
// Consent is only required where local law requires it for storing/reading
// device characteristics. Everywhere else we run enhanced analytics under
// consent_mode='not_required' and show no prompt at all — deliberately not a
// sitewide cookie banner.
//
// This list is the single place to update if the rules change.

/** EU/EEA member states (ISO 3166-1 alpha-2) plus Iceland, Liechtenstein, Norway. */
export const EEA_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
  // EEA (non-EU)
  "IS", "LI", "NO",
] as const;

/** United Kingdom, tracked separately from the EEA. */
export const UK_COUNTRIES = ["GB", "UK"] as const;

export const CONSENT_REQUIRED_COUNTRIES: ReadonlySet<string> = new Set<string>([
  ...EEA_COUNTRIES,
  ...UK_COUNTRIES,
]);

/**
 * Conservative by design: an unknown country is treated as consent-required,
 * so enhanced fingerprinting never runs on a visitor we cannot place.
 */
export function isConsentRequiredCountry(country: string | null | undefined): boolean {
  const code = (country ?? "").trim().toUpperCase();
  if (!code) return true;
  return CONSENT_REQUIRED_COUNTRIES.has(code);
}

export type PrivacyRegionResponse = {
  country: string | null;
  consentRequiredForEnhancedAnalytics: boolean;
};
