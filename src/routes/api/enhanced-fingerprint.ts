import { createFileRoute } from "@tanstack/react-router";
import { checkRateLimit } from "@/lib/rate-limit.server";
import {
  getRequestTelemetry,
  isAdminPath,
  isAutomatedAgent,
} from "@/lib/request-telemetry.server";
import { isConsentRequiredCountry } from "@/lib/privacy-region";

// Ingest for the enhanced device/browser fingerprint (see
// src/lib/enhanced-fingerprint.ts). One snapshot per session, upserted by
// session_id into public.visitor_fingerprints.
//
// The client may send only fingerprint fields plus visitor_id / session_id /
// consent_mode. IP, User-Agent, Accept-Language, country and ASN are always
// derived server-side from trustworthy edge data and never read from the body.

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}

function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function jsonArray(v: unknown, max: number): unknown[] | null {
  return Array.isArray(v) ? v.slice(0, max) : null;
}

function jsonObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export const Route = createFileRoute("/api/enhanced-fingerprint")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!(await checkRateLimit(request, "enhanced-fingerprint", "TRACKING_RATE_LIMITER"))) {
            return new Response(null, { status: 204 });
          }

          const t = getRequestTelemetry(request);

          // Same conservative automation rejection as /api/events.
          if (isAutomatedAgent(t.userAgent)) return new Response(null, { status: 204 });

          // Admin activity is never fingerprinted.
          const referer = request.headers.get("referer") ?? "";
          if (referer) {
            try {
              if (isAdminPath(new URL(referer).pathname)) {
                return new Response(null, { status: 204 });
              }
            } catch {
              /* ignore malformed referer */
            }
          }

          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

          const visitorId = str(body["visitor_id"], 100);
          const sessionId = str(body["session_id"], 100);
          if (!visitorId || !sessionId) return new Response(null, { status: 204 });

          const consentMode = str(body["consent_mode"], 20);
          if (consentMode !== "consented" && consentMode !== "not_required") {
            return new Response(null, { status: 204 });
          }

          // Independently confirm the claimed consent mode against the
          // request's own country. A client cannot talk its way out of the
          // consent requirement.
          const consentRequired = isConsentRequiredCountry(t.country);
          if (consentMode === "not_required" && consentRequired) {
            return new Response(null, { status: 204 });
          }

          const row = {
            visitor_id: visitorId,
            session_id: sessionId,
            consent_mode: consentMode,
            fingerprint_version: str(body["fingerprint_version"], 20) ?? "v1",
            fingerprint_hash: str(body["fingerprint_hash"], 128),
            canvas_hash: str(body["canvas_hash"], 128),
            font_hash: str(body["font_hash"], 128),
            font_count: int(body["font_count"]),
            webgl_hash: str(body["webgl_hash"], 128),
            webgl_vendor: str(body["webgl_vendor"], 200),
            webgl_renderer: str(body["webgl_renderer"], 300),
            audio_hash: str(body["audio_hash"], 128),
            hardware_concurrency: int(body["hardware_concurrency"]),
            device_memory: num(body["device_memory"]),
            screen_width: int(body["screen_width"]),
            screen_height: int(body["screen_height"]),
            pixel_ratio: num(body["pixel_ratio"]),
            color_depth: int(body["color_depth"]),
            timezone: str(body["timezone"], 80),
            timezone_offset: int(body["timezone_offset"]),
            language: str(body["language"], 40),
            languages: jsonArray(body["languages"], 12),
            platform: str(body["platform"], 80),
            max_touch_points: int(body["max_touch_points"]),
            connection_effective_type: str(body["connection_effective_type"], 20),
            connection_downlink: num(body["connection_downlink"]),
            connection_rtt: int(body["connection_rtt"]),
            connection_save_data: bool(body["connection_save_data"]),
            ua_ch_platform: str(body["ua_ch_platform"], 80),
            ua_ch_mobile: bool(body["ua_ch_mobile"]),
            ua_ch_brands: jsonArray(body["ua_ch_brands"], 12),
            ua_high_entropy: jsonObject(body["ua_high_entropy"]),
            // Server-derived only.
            country: t.country,
            ip_address: t.ipAddress,
            user_agent: t.userAgent,
            accept_language: t.acceptLanguage,
            asn: t.asn,
            as_organization: t.asOrganization,
          };

          const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
          const supabase = getSupabaseAdmin();
          const { error } = await supabase
            .from("visitor_fingerprints")
            .upsert(row, { onConflict: "session_id" });
          if (error) console.error("[api/enhanced-fingerprint] upsert failed", error.message);

          return new Response(null, { status: 204 });
        } catch (err) {
          console.error("[api/enhanced-fingerprint] handler failed", err);
          return new Response(null, { status: 204 });
        }
      },
    },
  },
});
