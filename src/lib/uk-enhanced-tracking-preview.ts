/**
 * UK enhanced-analytics report preview.
 *
 * No endpoints, database writes, cookies, fingerprint collection or UI imports.
 * This helper formats previously collected, explicitly consented UK data for
 * review before any feature is wired into the app.
 *
 * Do not treat a browser fingerprint as proof of a person's identity.
 */
import type { FingerprintPayload } from "./enhanced-fingerprint";

export type UKPreviewFingerprint = Pick<
  FingerprintPayload,
  | "visitor_id"
  | "session_id"
  | "consent_mode"
  | "fingerprint_hash"
  | "canvas_hash"
  | "font_hash"
  | "webgl_hash"
  | "audio_hash"
  | "webgl_vendor"
  | "webgl_renderer"
  | "hardware_concurrency"
  | "device_memory"
  | "screen_width"
  | "screen_height"
  | "pixel_ratio"
  | "timezone"
  | "language"
  | "languages"
  | "platform"
  | "ua_ch_platform"
  | "ua_ch_mobile"
  | "connection_effective_type"
>;

export type UKPreviewEvent = {
  event_id: string;
  visitor_id: string;
  session_id: string;
  occurred_at: string;
  event_name: string;
  path?: string | null;
  publication_id?: string | null;
  publication_title?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type UKPreviewInput = {
  country: string | null;
  consentChoice: "allow" | "deny" | null;
  fingerprint: UKPreviewFingerprint | null;
  events: UKPreviewEvent[];
};

export type UKPreviewTimelineItem = {
  occurredAt: string;
  action: string;
  path: string | null;
  publication: string | null;
};

export type UKPreviewReport = {
  previewOnly: true;
  country: "GB";
  visitorId: string;
  sessionId: string;
  fingerprint: {
    fingerprintHash: string | null;
    canvasHash: string | null;
    fontHash: string | null;
    webglHash: string | null;
    audioHash: string | null;
    graphicsVendor: string | null;
    graphicsRenderer: string | null;
    processorThreads: number | null;
    deviceMemoryGb: number | null;
    screen: string | null;
    timezone: string | null;
    language: string | null;
    languages: string[] | null;
    platform: string | null;
    clientHintPlatform: string | null;
    mobileHint: boolean | null;
    connectionType: string | null;
  };
  activity: {
    firstEventAt: string | null;
    lastEventAt: string | null;
    observedSpanSeconds: number;
    recordedActiveSeconds: number;
    pageViews: number;
    pdfOpenEvents: number;
    downloadRequests: number;
    distinctPublicationsOpened: number;
    shares: number;
    printClicks: number;
    timeline: UKPreviewTimelineItem[];
  };
};

export type UKPreviewResult =
  | { status: "outside_uk" | "consent_required" | "missing_consented_snapshot"; report: null }
  | { status: "ready"; report: UKPreviewReport };

function cleanPath(path: string | null | undefined): string | null {
  if (!path) return null;
  // Never expose query strings or fragments in the owner preview.
  const clean = path.split(/[?#]/, 1)[0] ?? "";
  return clean.startsWith("/") ? clean : null;
}

function asSeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  // Matches the cap applied by canonical analytics.
  return Math.min(20, value);
}

/**
 * Builds a read-only per-session summary. The consent check deliberately runs
 * BEFORE inspecting the fingerprint or event history. No "test mode" bypass.
 */
export function buildUKEnhancedTrackingPreview(input: UKPreviewInput): UKPreviewResult {
  const country = (input.country ?? "").trim().toUpperCase();
  if (country !== "GB" && country !== "UK") {
    return { status: "outside_uk", report: null };
  }
  if (input.consentChoice !== "allow") {
    return { status: "consent_required", report: null };
  }

  const fp = input.fingerprint;
  if (!fp || fp.consent_mode !== "consented" || !fp.visitor_id || !fp.session_id) {
    return { status: "missing_consented_snapshot", report: null };
  }

  const seenEventIds = new Set<string>();
  const matching = input.events
    .filter((e) => e.visitor_id === fp.visitor_id && e.session_id === fp.session_id)
    .filter((e) => Boolean(e.event_id) && Number.isFinite(Date.parse(e.occurred_at)))
    .filter((e) => {
      if (seenEventIds.has(e.event_id)) return false;
      seenEventIds.add(e.event_id);
      return true;
    })
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));

  const firstMs = matching.length ? Date.parse(matching[0]!.occurred_at) : null;
  const lastMs = matching.length ? Date.parse(matching[matching.length - 1]!.occurred_at) : null;

  const opened = new Set(
    matching
      .filter((e) => e.event_name === "pdf_open" && e.publication_id)
      .map((e) => e.publication_id),
  );

  const screen =
    fp.screen_width != null && fp.screen_height != null
      ? `${fp.screen_width} x ${fp.screen_height} @${fp.pixel_ratio ?? "?"}x`
      : null;

  return {
    status: "ready",
    report: {
      previewOnly: true,
      country: "GB",
      visitorId: fp.visitor_id,
      sessionId: fp.session_id,
      fingerprint: {
        fingerprintHash: fp.fingerprint_hash,
        canvasHash: fp.canvas_hash,
        fontHash: fp.font_hash,
        webglHash: fp.webgl_hash,
        audioHash: fp.audio_hash,
        graphicsVendor: fp.webgl_vendor,
        graphicsRenderer: fp.webgl_renderer,
        processorThreads: fp.hardware_concurrency,
        deviceMemoryGb: fp.device_memory,
        screen,
        timezone: fp.timezone,
        language: fp.language,
        languages: fp.languages,
        platform: fp.platform,
        clientHintPlatform: fp.ua_ch_platform,
        mobileHint: fp.ua_ch_mobile,
        connectionType: fp.connection_effective_type,
      },
      activity: {
        firstEventAt: matching[0]?.occurred_at ?? null,
        lastEventAt: matching[matching.length - 1]?.occurred_at ?? null,
        observedSpanSeconds:
          firstMs == null || lastMs == null ? 0 : Math.max(0, (lastMs - firstMs) / 1000),
        recordedActiveSeconds: matching
          .filter((e) => e.event_name === "heartbeat")
          .reduce((sum, e) => sum + asSeconds(e.metadata?.active_seconds), 0),
        pageViews: matching.filter((e) => e.event_name === "page_view").length,
        pdfOpenEvents: matching.filter((e) => e.event_name === "pdf_open").length,
        downloadRequests: matching.filter((e) => e.event_name === "download").length,
        distinctPublicationsOpened: opened.size,
        shares: matching.filter((e) => e.event_name === "share_click").length,
        printClicks: matching.filter((e) => e.event_name === "print_click").length,
        timeline: matching.map((e) => ({
          occurredAt: e.occurred_at,
          action: e.event_name,
          path: cleanPath(e.path),
          publication: e.publication_title ?? null,
        })),
      },
    },
  };
}
