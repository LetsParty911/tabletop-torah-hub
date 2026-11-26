import { createStart, createMiddleware } from "@tanstack/react-start";
import { K_REDIRECT_TARGET } from "@/lib/k-redirect";
import { getSenderNetRedirectTarget } from "@/lib/sender-net-redirects";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// All methods and paths reaching Start, before redirects/auth/security/telemetry.
// No admin, internal-device or trusted-VPN exemptions. Not a static-assets WAF.
const countryGate = createMiddleware().server(async ({ next, request }) => {
  const { checkCountryBlock } = await import("@/lib/country-block.server");
  const denied = checkCountryBlock(request);
  if (denied) return { response: denied } as never;
  return next();
});

/**
 * Cache-Control header policy for the HTML entry point and static assets.
 *
 * - HTML documents must always be revalidated so that new deploys are picked up
 *   immediately (hashed JS/CSS references in the shell change every build).
 * - Only fingerprinted code and original series covers are immutable.
 *   Mutable logos and publication artwork must be revalidated.
 *
 * HTML <meta http-equiv="Cache-Control"> is unreliable and ignored by most
 * browsers / CDNs, so we set real HTTP response headers here on the Worker.
 */
/**
 * Permanent domain consolidation: torahforthetable.org (and www) is not a
 * separate site — every path 308-redirects to the same path on the .com apex.
 */
const dotOrgRedirect = createMiddleware().server(async ({ next, request }) => {
  try {
    const url = new URL(request.url);
    if (/(^|\.)torahforthetable\.org$/i.test(url.hostname)) {
      const target = `https://torahforthetable.com${url.pathname}${url.search}`;
      return {
        response: new Response(null, {
          status: 308,
          headers: { Location: target, "Cache-Control": "public, max-age=3600" },
        }),
      } as never;
    }
  } catch {
    /* never break the request */
  }
  return next();
});

const cacheControl = createMiddleware().server(async ({ next, request }) => {
  const result = await next();
  const response = (result as { response?: Response }).response;
  if (!response || !(response instanceof Response)) return result;
  const path = new URL(request.url).pathname;
  const contentType = response.headers.get("content-type") || "";
  const isDocument = contentType.includes("text/html");
  const isLiveData = /^\/(?:_serverFn)(?:\/|$)/.test(path) || path === "/api/site-version";
  // /assets contains mutable public logos as well as fingerprinted Vite files.
  // Only genuinely versioned files are immutable; never blanket-cache /assets.
  const isImmutable = /^\/original-series-covers\/[^/]+\.[a-f0-9]{10}\.webp$/.test(path) ||
    /^\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.(?:js|mjs|css|woff2?)$/.test(path);
  const isMutableAsset = /^\/(?:assets|publication-covers|original-series-covers)\//.test(path) ||
    path === "/sw.js" || path === "/manifest.webmanifest";
  if (!isDocument && !isLiveData && !isImmutable && !isMutableAsset) return result;
  const headers = new Headers(response.headers);
  if (isDocument || isLiveData) {
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
  } else if (isImmutable && response.ok) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    headers.set("Cache-Control", "no-cache, max-age=0, must-revalidate");
  }
  // Response headers may be immutable at the Worker boundary.
  return { ...result, response: new Response(response.body, {
    status: response.status, statusText: response.statusText, headers,
  }) };
});

/**
 * Blocked-city visitor gate (exact city + region + country rules in
 * BLOCKED_CITIES): resolve approximate IP location server-side (memoized,
 * single-flight, time-boxed, fail open), log the attempt to blocked_visits,
 * and serve a static 403 "not available from your location" page. All logic
 * lives in geo-block.server.ts; everyone else falls through to next().
 */
const geoBlock = createMiddleware().server(async ({ next, request }) => {
  const { checkGeoBlock } = await import("@/lib/geo-block.server");
  const blocked = await checkGeoBlock(request);
  if (blocked) return { response: blocked } as never;
  return next();
});

/**
 * Optional anonymous-network monitor / gate. Defaults to monitor-only.
 * Runs ahead of location restrictions, with admin and marked-device exemptions.
 */
const vpnGate = createMiddleware().server(async ({ next, request }) => {
  const { checkVpnBlock } = await import("@/lib/vpn-block.server");
  const denied = await checkVpnBlock(request);
  if (denied) return { response: denied } as never;
  return next();
});

/**
 * Maintenance traffic: after the response exists, log a sanitized row when a
 * real public HTML navigation was served while persistent maintenance is ON.
 * Runs after geoBlock, so blocked-city requests stay only in blocked_visits.
 * Best-effort and fail-open; see maintenance-traffic.server.ts.
 */
const maintenanceTraffic = createMiddleware().server(async ({ next, request }) => {
  const result = await next();
  try {
    const response = (result as { response?: Response }).response;
    const { recordMaintenanceVisitFromMiddleware } = await import("@/lib/maintenance-traffic.server");
    await recordMaintenanceVisitFromMiddleware(request, response);
  } catch {
    /* never break the request */
  }
  return result;
});

// Short OurKehilla announcement link. Handle it at the request boundary,
// independent of generated file-route registration, to avoid a /k 404.
const ourKehillaShortLink = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/k") {
    return {
      response: new Response(null, {
        status: 302,
        headers: {
          Location: K_REDIRECT_TARGET,
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      }),
    } as never;
  }
  return next();
});

// Sender.net email links redirect before rendering; only the tagged homepage
// load is attributed, with no analytics event for the short path itself.
const senderNetShortLinks = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  const target = request.method === "GET"
    ? getSenderNetRedirectTarget(url.pathname)
    : undefined;
  if (target) {
    return {
      response: new Response(null, {
        status: 302,
        headers: {
          Location: target,
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      }),
    } as never;
  }
  return next();
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [countryGate, dotOrgRedirect, ourKehillaShortLink, senderNetShortLinks, vpnGate, geoBlock, maintenanceTraffic, cacheControl],
}));
