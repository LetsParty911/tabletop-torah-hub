// Local, versioned record of the visitor's enhanced-analytics choice.
//
// Only consulted where our regional rules require consent. Elsewhere no prompt
// is shown at all and enhanced analytics runs under consent_mode
// 'not_required'.

export const CONSENT_STORAGE_KEY = "tftt:enhanced-analytics-consent:v1";

export type ConsentChoice = "allow" | "deny";

export function readConsentChoice(): ConsentChoice | null {
  try {
    const value = localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === "allow" || value === "deny" ? value : null;
  } catch {
    return null;
  }
}

export function writeConsentChoice(choice: ConsentChoice): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    /* ignore */
  }
}

export function clearConsentChoice(): void {
  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
