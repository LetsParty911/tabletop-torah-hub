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
  /** An explicit human_signal event was recorded. */
  humanSignal: boolean;
  /** A download, PDF open, click, search, chooser or My Table action. */
  meaningfulIntent: boolean;
  pageviews: number;
  /** Rendered publication cards seen in the session. */
  impressions: number;
  durationMs: number;
};

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
    "A deliberate action such as opening a PDF, choosing, searching or saving was recorded.",
  uncertain:
    "The visit was recorded but showed no deliberate action, so it cannot be classified either way.",
  suspected_automation:
    "The session matched a specific automation pattern and showed no deliberate action. Rows are kept; they are set aside from headline counts.",
  internal_test:
    "The request came from a device marked internal by an administrator, or from the editor preview.",
};

/**
 * Classification order matters: an explicit human signal or a real action always
 * protects a session from the generic automation rules.
 */
export function classifySession(input: ConfidenceInput): TrafficConfidence {
  if (input.internal) return "internal_test";

  if (input.humanSignal && input.meaningfulIntent) return "high_confidence_human";
  if (input.meaningfulIntent) return "likely_human";
  if (input.humanSignal) return "likely_human";

  if (input.flaggedAutomation) return "suspected_automation";

  // Sustained, multi-page reading with real dwell time is likely a person even
  // without a recorded interaction event.
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
