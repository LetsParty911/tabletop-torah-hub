// Deterministic, reporting-only traffic confidence classification.
//
// This is computed at report time from canonical session aggregates. Nothing is
// written back to the event rows: raw data is never stamped with a verdict, so
// the rules can be revised without rewriting history.
//
// The labels describe how confident the *reporting* is that a session came from
// a real reader. They never claim to identify a person.

export type TrafficConfidence =
  | "high_confidence_human"
  | "likely_human"
  | "uncertain"
  | "suspected_automation"
  | "internal_test";

export type ConfidenceInput = {
  /** Server-verified internal/test device, or known Lovable editor traffic. */
  internal: boolean;
  /** Matched an explicit automation rule (burst, impossible cadence, incident). */
  flaggedAutomation: boolean;
  /** Network belongs to known cloud/security infrastructure (see INFRASTRUCTURE_ORGANIZATIONS). */
  infrastructureNetwork?: boolean;
  /** An explicit human_signal event was recorded. */
  humanSignal: boolean;
  /** A download, PDF open, click, search, chooser or My Table action. */
  meaningfulIntent: boolean;
  pageviews: number;
  /** Number of distinct navigated paths; reloading one URL cannot establish multi-page reading. */
  distinctPagePaths?: number;
  /** Rendered publication cards seen in the session. */
  impressions: number;
  durationMs: number;
};

/**
 * Cloud hosting / security-scanning networks. A real reader can browse through
 * these (corporate VPNs, secure DNS), so only a deliberate action (meaningful
 * intent) can qualify such a session for headline counts. Passive signals —
 * a generic human_signal, page views, impressions, heartbeats or dwell time —
 * are NOT sufficient on these networks (2026-10-16 Azure passive-session fix).
 *
 * Needles are matched against the normalized organization name (lowercase,
 * commas removed, whitespace collapsed). Keep them narrow: never add a bare
 * vendor name such as "google" or a consumer ISP like "verizon business".
 */
export const INFRASTRUCTURE_ORGANIZATIONS = [
  "amazon.com",
  "amazon technologies",
  "amazon data services",
  "cisco opendns",
  "cloudflare",
  "fastly",
  "latitude.sh",
  "microsoft corporation",
  "microsoft azure",
  "azure cloud",
  "google cloud",
  "digitalocean",
  "hetzner online",
  "ovh sas",
  "ovh hosting",
  "ovhcloud",
  "leaseweb",
  "oracle cloud",
  "oracle public cloud",
];

export function normalizeOrganization(org: string | null | undefined): string {
  return org?.trim().toLowerCase().replace(/,/g, "").replace(/\s+/g, " ") ?? "";
}

export function isInfrastructureOrganization(org: string | null | undefined): boolean {
  const value = normalizeOrganization(org);
  if (!value) return false;
  return INFRASTRUCTURE_ORGANIZATIONS.some((needle) => value.includes(needle));
}

/** Low-signal: at most one page, no card impressions, under 30 seconds. */
export const INFRASTRUCTURE_MAX_DURATION_MS = 30_000;

export const CONFIDENCE_LABELS: Record<TrafficConfidence, string> = {
  high_confidence_human: "High-confidence human",
  likely_human: "Likely human",
  uncertain: "Uncertain",
  suspected_automation: "Suspected automation",
  internal_test: "Internal / test",
};

export const CONFIDENCE_EXPLANATIONS: Record<TrafficConfidence, string> = {
  high_confidence_human:
    "An explicit human interaction signal was recorded alongside a deliberate Torah action.",
  likely_human:
    "Evidence of human-like interaction, a deliberate site action, or navigation across distinct pages. This is not proof that a PDF was opened or read.",
  uncertain:
    "The visit was recorded but showed no deliberate action, so it cannot be classified either way. Passive visits from cloud-hosting networks stay here even with dwell time or a generic interaction signal.",
  suspected_automation:
    "The session matched a specific automation pattern and showed no deliberate action. Rows are kept; they are set aside from headline counts.",
  internal_test:
    "The request came from a device marked internal by an administrator, or from the editor preview.",
};

/**
 * Classification order matters:
 * 1. internal always wins;
 * 2. a deliberate action protects any session, including cloud networks;
 * 3. on known cloud/security infrastructure without a deliberate action, the
 *    session can never become headline traffic: automation-rule matches and
 *    short one-page sessions are suspected_automation, everything else is
 *    uncertain (uncounted) — a generic human_signal alone is not conclusive;
 * 4. other networks require an observed human_signal, deliberate action, or
 *    sustained navigation across DISTINCT paths. Homepage reloads and heartbeat
 *    volume do not prove multiple pages of reading.
 */
export function classifySession(input: ConfidenceInput): TrafficConfidence {
  if (input.internal) return "internal_test";

  if (input.meaningfulIntent) return input.humanSignal ? "high_confidence_human" : "likely_human";

  if (input.infrastructureNetwork) {
    if (input.flaggedAutomation) return "suspected_automation";
    if (
      !input.humanSignal &&
      input.pageviews <= 1 &&
      input.impressions === 0 &&
      input.durationMs < INFRASTRUCTURE_MAX_DURATION_MS
    )
      return "suspected_automation";
    return "uncertain";
  }

  if (input.humanSignal) return "likely_human";
  if (input.flaggedAutomation) return "suspected_automation";

  // Only genuinely distinct navigated URLs qualify as sustained browsing.
  // Repeated page_view events on the same URL, impressions and heartbeat
  // samples must not promote a passive session to a likely-human visitor.
  const distinctPaths = input.distinctPagePaths ?? 0;
  if (distinctPaths >= 3 && input.durationMs >= 30_000) return "likely_human";
  if (distinctPaths >= 2 && input.impressions > 0 && input.durationMs >= 10_000)
    return "likely_human";

  return "uncertain";
}

export type ConfidenceCounts = Record<TrafficConfidence, number>;

export function emptyConfidenceCounts(): ConfidenceCounts {
  return {
    high_confidence_human: 0,
    likely_human: 0,
    uncertain: 0,
    suspected_automation: 0,
    internal_test: 0,
  };
}

/**
 * Diagnostic only. Two visitor IDs that share network evidence are reported as a
 * *possible* relationship and are never merged: a shared carrier NAT, office
 * network or VPN exit produces exactly the same evidence as one person on two
 * devices.
 */
export type PossibleRelationship = {
  visitorIds: string[];
  sharedEvidence: string;
  verdict: "possible relationship" | "insufficient evidence";
  note: string;
};

export function describePossibleRelationship(
  visitorIds: string[],
  sharedEvidence: string,
  supportingSignals: number,
): PossibleRelationship {
  return {
    visitorIds,
    sharedEvidence,
    verdict: supportingSignals >= 2 ? "possible relationship" : "insufficient evidence",
    note: "Diagnostic only. Visitor IDs are never merged on network or device evidence.",
  };
}
