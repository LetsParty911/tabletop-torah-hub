import { createFileRoute } from "@tanstack/react-router";
import { checkRateLimit } from "@/lib/rate-limit.server";
import {
  getRequestTelemetry,
  isAdminPath,
  isAutomatedAgent,
} from "@/lib/request-telemetry.server";

// Canonical first-party event ingest for the Phase 1 stream.
//
// Writes to public.analytics_events in the external "torah-by-the-table"
// project (see supabase_analytics_events_migration.sql). Legacy
// page_views / search_events / download_events writes are unaffected.
//
// Captures the raw client IP address, User-Agent, Accept-Language and
// low-entropy UA client hints server-side for accepted events, plus ASN /
// network organization when the edge runtime exposes them. Device type is
// derived here from the UA header and only the coarse bucket is persisted.
// Geo is limited to country + region + city + postal_code for this table.
// None of these values are ever read from the JSON request body.

const ALLOWED_EVENTS = new Set([
  "session_start",
  "page_view",
  "publication_impression",
  "publication_click",
  "filter_change",
  "search",
  "pdf_open",
  "download",
  "share_click",
  "signup",
  "heartbeat",
  "human_signal",
  "chooser_select",
  "recommendation_view",
  "recommendation_click",
  "my_table_add",
  "my_table_remove",
  "my_table_open",
  "error",
]);

function deviceTypeFrom(ua: string): string {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|windows phone/.test(s)) return "mobile";
  return "desktop";
}

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!(await checkRateLimit(request, "events", "TRACKING_RATE_LIMITER"))) {
            return new Response(null, { status: 204 });
          }

          // Drop obvious automated traffic before anything is persisted.
          if (isAutomatedAgent(request.headers.get("user-agent") ?? "")) {
            return new Response(null, { status: 204 });
          }

          // Never record admin activity, even if the payload claims otherwise.
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
          const incoming = Array.isArray(body["events"]) ? (body["events"] as unknown[]) : [];
          if (!incoming.length) return new Response(null, { status: 204 });

          // Approximate, network-derived location only, alongside the raw
          // client IP, User-Agent and request header telemetry.
          const t = getRequestTelemetry(request);
          const deviceType = deviceTypeFrom(t.userAgent);
          // One resolution per request (cached per IP for 7 days) — never per event.
          const { resolveApproximateGeo } = await import("@/lib/ip-geo.server");
          const geo = await resolveApproximateGeo(t);

          const rows: Array<Record<string, unknown>> = [];

          for (const raw of incoming.slice(0, 50)) {
            if (!raw || typeof raw !== "object") continue;
            const e = raw as Record<string, unknown>;

            const str = (k: string, max = 300): string | null => {
              const v = e[k];
              return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
            };

            const eventName = str("event_name", 60);
            const eventId = str("event_id", 100);
            const visitorId = str("visitor_id", 100);
            const sessionId = str("session_id", 100);
            if (!eventName || !ALLOWED_EVENTS.has(eventName)) continue;
            if (!eventId || !visitorId || !sessionId) continue;

            const rawPath = str("path", 400) ?? "/";
            const path = (rawPath.split("?")[0] ?? "/").slice(0, 300);
            if (isAdminPath(path)) continue;

            const occurredAt = str("occurred_at", 40);
            const occurred =
              occurredAt && !Number.isNaN(Date.parse(occurredAt))
                ? new Date(occurredAt).toISOString()
                : new Date().toISOString();

            const jy = Number(e["jewish_year"]);

            let metadata: Record<string, unknown> = {};
            if (
              e["metadata"] &&
              typeof e["metadata"] === "object" &&
              !Array.isArray(e["metadata"])
            ) {
              // Keep the payload small and predictable.
              metadata = Object.fromEntries(
                Object.entries(e["metadata"] as Record<string, unknown>)
                  .slice(0, 20)
                  .map(([k, v]) => [k.slice(0, 40), typeof v === "string" ? v.slice(0, 300) : v]),
              );
            }

            rows.push({
              event_id: eventId,
              event_name: eventName,
              occurred_at: occurred,
              visitor_id: visitorId,
              session_id: sessionId,
              is_new_visitor: e["is_new_visitor"] === true,
              path,
              landing_path: (str("landing_path", 400) ?? "").split("?")[0] || null,
              source_path: (str("source_path", 400) ?? "").split("?")[0] || null,
              publication_id: str("publication_id", 100),
              publication_title: str("publication_title", 300),
              publication_series: str("publication_series", 300),
              publisher: str("publisher", 200),
              parsha: str("parsha", 120),
              jewish_year: Number.isFinite(jy) && jy > 0 ? Math.trunc(jy) : null,
              device_type: deviceType,
              referrer_host: str("referrer_host", 200),
              referrer_url: str("referrer_url", 800),
              utm_source: str("utm_source", 120),
              utm_medium: str("utm_medium", 120),
              utm_campaign: str("utm_campaign", 200),
              source_group: str("source_group", 40) ?? "Direct",
              country: geo.country,
              region: geo.region,
              city: geo.city,
              postal_code: geo.postalCode,
              geo_source: geo.geoSource,
              geo_provider: geo.provider,
              geo_reliability: geo.reliability,
              network_type: geo.networkType,
              ip_address: t.ipAddress,
              user_agent: t.userAgent,
              accept_language: t.acceptLanguage,
              sec_ch_ua: t.secChUa,
              sec_ch_platform: t.secChPlatform,
              sec_ch_mobile: t.secChMobile,
              asn: geo.asn ?? t.asn,
              as_organization: geo.asOrganization ?? t.asOrganization,
              metadata,
            });
          }

          if (!rows.length) return new Response(null, { status: 204 });

          const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
          const supabase = getSupabaseAdmin();

          // event_id is unique, so a retried beacon collapses onto one row.
          const { error } = await supabase
            .from("analytics_events")
            .upsert(rows, { onConflict: "event_id", ignoreDuplicates: true });
          if (error) {
            console.error("[api/events] insert failed", error.message);
            // The geo_source column may not exist yet — never lose the event.
            if (/geo_source/.test(error.message)) {
              const legacy = rows.map(({ geo_source: _drop, ...rest }) => rest);
              const retry = await supabase
                .from("analytics_events")
                .upsert(legacy, { onConflict: "event_id", ignoreDuplicates: true });
              if (retry.error) console.error("[api/events] retry failed", retry.error.message);
            }
          }

          return new Response(null, { status: 204 });
        } catch (err) {
          console.error("[api/events] handler failed", err);
          return new Response(null, { status: 204 });
        }
      },
    },
  },
});
