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
  /** Known cloud/security infrastructure, by network organization or explicit hosting flag. */
  infrastructureNetwork?: boolean;
  /** An interaction signal such as scroll or touch, not proof of deliberate Torah use. */
  humanSignal: boolean;
  /** A deliberate action: excludes automatic pdf_open previews and generic human_signal. */
  meaningfulIntent: boolean;
  pageviews: number;
  /** Rendered publication cards seen in the session. */
  impressions: number;
  durationMs: number;
};

/**
 * Known cloud hosting and security-scanning networks. Real readers may use
 * corporate VPNs or secure DNS, so an actual deliberate action still qualifies.
 * But passive viewing, scroll signals and dwell time alone are not sufficient
 * evidence to include infrastructure traffic in human-reader totals.
 */
export const INFRASTRUCTURE_ORGANIZATIONS = [
  "amazon.com",
  "amazon technologies",
  "cisco opendns",
  "cloudflare",
  "fastly",
  "latitude.sh",
  "microsoft corporation",
  "microsoft azure",
  "ovh sas",
];

export function isInfrastructureOrganization(org: string | null | undefined): boolean {
  const value = org?.trim().toLowerCase().replace(/,/g, "") ?? "";
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
    "An interaction signal and a deliberate action were both recorded, not just an automatic PDF preview.",
  likely_human:
    "A deliberate action was recorded, or a non-infrastructure session showed a human signal or sustained reading.",
  uncertain:
    "The visit lacks sufficient human evidence; cloud/security sessions with only passive signals or reading also remain uncertain.",
  suspected_automation:
    "The session matched a specific automation pattern and showed no deliberate action. Rows are kept; they are set aside from headline counts.",
  internal_test:
    "The request came from a device marked internal by an administrator, or from the editor preview.",
};

/**
 * Classification order matters: deliberate actions qualify even on hosting
 * networks. Passive previews, scrolling and dwell time never suffice by
 * themselves to qualify cloud/security infrastructure as human readership.
 */
export function classifySession(input: ConfidenceInput): TrafficConfidence {
  if (input.internal) return "internal_test";

  // A cloud/security-network session must have a deliberate action to enter
  // human totals. A generic human_signal can come from scrolling or automated
  // browser activity; an embedded PDF viewer may also load automatically.
  if (input.infrastructureNetwork && !input.meaningfulIntent) {
    // A weak interaction signal is evidence against automatically flagging it
    // as a bot, but is not enough to assert a human reader.
    if (input.humanSignal) return "uncertain";
    if (
      input.flaggedAutomation ||
      (input.pageviews <= 1 &&
        input.impressions === 0 &&
        input.durationMs < INFRASTRUCTURE_MAX_DURATION_MS)
    ) return "suspected_automation";
    return "uncertain";
  }

  if (input.humanSignal && input.meaningfulIntent) return "high_confidence_human";
  if (input.meaningfulIntent) return "likely_human";
  if (input.humanSignal) return "likely_human";

  if (input.flaggedAutomation) return "suspected_automation";

  // Sustained, multi-page reading with real dwell time on a non-hosting network
  // can be likely human even without a recorded interaction event.
  if (input.pageviews >= 3 && input.durationMs >= 30_000) return "likely_human";
  if (input.pageviews >= 2 && input.impressions > 0 && input.durationMs >= 10_000)
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
