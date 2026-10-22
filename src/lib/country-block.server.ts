/**
 * Origin-level policy, not an upstream WAF. Lovable's hosting router forwards
 * cf-ipcountry; request.runtime.cloudflare has no original cf geo object.
 * Do not use getRequestTelemetry here: its Vercel fallback is not authoritative
 * for this policy. Router header sanitization is not independently attested.
 */
const DENIED_COUNTRIES: ReadonlySet<string> = new Set(["IN", "PK", "BD", "VN", "CN"]);

export function checkCountryBlock(request: Request): Response | null {
  // Exact uppercase only; no normalization, alternate headers or identity bypass.
  const country = request.headers.get("cf-ipcountry");
  if (country === null || !DENIED_COUNTRIES.has(country)) return null;

  const path = new URL(request.url).pathname;
  const machineResponse = path === "/api" || path.startsWith("/api/") ||
    path === "/_serverFn" || path.startsWith("/_serverFn/");
  const pdfResponse = /\/(pdf|download|print)\/?$/.test(path) ||
    path.toLowerCase().endsWith(".pdf") ||
    (request.headers.get("accept") ?? "").includes("application/pdf");
  const htmlResponse = !machineResponse && !pdfResponse &&
    (request.headers.get("accept") ?? "").includes("text/html");
  const body = machineResponse
    ? JSON.stringify({ error: "Access unavailable" })
    : htmlResponse
      ? '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Access unavailable</title></head><body><main><h1>Access unavailable</h1><p>This service is not available from your location.</p></main></body></html>'
      : "Access unavailable. This service is not available from your location.\n";

  return new Response(request.method === "HEAD" ? null : body, {
    status: 403,
    headers: {
      "Content-Type": machineResponse ? "application/json; charset=utf-8" :
        htmlResponse ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Cloudflare-CDN-Cache-Control": "no-store",
      "Pragma": "no-cache",
      "Expires": "0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}