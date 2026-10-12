import { createFileRoute } from "@tanstack/react-router";
import { getClientIP } from "@/lib/request-telemetry.server";
import { previewVpnLookup, shouldDenyPrivacy } from "@/lib/vpn-block.server";

// Diagnostic is intentionally independent of Lovable Cloud and the maintenance
// gate. Never takes an arbitrary IP parameter and never writes visitor analytics.
// Only intended for temporary Vercel preview builds.
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-TFTT-Test": "vpn-diagnostic",
};

function htmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

export const Route = createFileRoute("/api/vpn-diagnostic")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        // Never enable this unauthenticated diagnostic on the public .com site.
        if (!url.hostname.endsWith(".vercel.app")) {
          return new Response("Not found", {
            status: 404, headers: { ...headers, "Content-Type": "text/plain" },
          });
        }

        const ip = getClientIP(request);
        const result = await previewVpnLookup(ip);
        const detection = result?.value;
        const verdict = !result || !detection
          ? "unknown"
          : detection.signals.length ? "detected" : "not_detected";
        const signals = detection?.signals ?? [];
        const wouldBlock = shouldDenyPrivacy(detection ?? null);
        const body = {
          verdict,
          signals,
          confidence: detection?.confidence ?? null,
          wouldBlock,
          lookupStatus: result?.status ?? "missing_ip",
          lookupSource: result?.source ?? "skipped",
          lookupMs: result?.elapsed ?? null,
          checkedAt: new Date().toISOString(),
          note: "A preview-only diagnostic. Does not switch on blocking or write analytics.",
        };

        if (url.searchParams.get("format") === "json") {
          return Response.json(body, { headers });
        }

        const heading = verdict === "detected" ? "VPN or proxy detected"
          : verdict === "not_detected" ? "No VPN detected"
          : "Connection check inconclusive";
        const detail = verdict === "detected"
          ? "This connection is identified by the privacy-detection service."
          : verdict === "not_detected"
            ? "This IP was not identified as VPN, proxy or Tor by the service. That does not prove it is a regular connection."
            : "The detection service did not provide a usable result. This is not a clean verdict.";
        const color = verdict === "detected" ? "#9c5d34"
          : verdict === "not_detected" ? "#275c4d" : "#615981";
        const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>VPN Detection Test — TorahForTheTable.com</title><style>
          body{margin:0;min-height:100vh;display:flex;justify-content:center;align-items:center;background:#f7f2e7;font-family:system-ui,sans-serif;color:#1b2a4a;padding:20px;box-sizing:border-box}
          main{max-width:620px;width:100%;background:#fff;border:1px solid #d5c7ab;border-radius:12px;padding:30px;box-sizing:border-box;box-shadow:0 12px 30px #1b2a4a0d}
          h1{font:700 19px Georgia,serif;color:#b08a3e;letter-spacing:.03em;margin:0 0 20px}
          h2{font:700 26px Georgia,serif;color:${color};margin:0 0 12px}p{line-height:1.6}
          dl{border-top:1px solid #eee;padding-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
          dt{font-weight:600;font-size:13px;color:#4a5570}dd{margin:3px 0 0;overflow-wrap:anywhere}
          a{color:#1b2a4a;font-weight:700}small{display:block;color:#6b7280;line-height:1.5}
        </style></head><body><main><h1>TorahForTheTable.com — Connection Test</h1>
          <h2>${htmlEscape(heading)}</h2>
          <p>${htmlEscape(detail)}</p>
          <dl>
            <div><dt>Signals</dt><dd>${htmlEscape(signals.join(", ") || "None")}</dd></div>
            <div><dt>Confidence</dt><dd>${detection?.confidence ?? "Unknown"}</dd></div>
            <div><dt>Would block (strict rule)</dt><dd>${wouldBlock ? "Yes" : "No"}</dd></div>
            <div><dt>Lookup status</dt><dd>${htmlEscape(body.lookupStatus)}</dd></div>
            <div><dt>Lookup source</dt><dd>${htmlEscape(body.lookupSource)}</dd></div>
            <div><dt>Checked at (UTC)</dt><dd>${htmlEscape(body.checkedAt)}</dd></div>
          </dl>
          <p>Turn NordVPN <strong>off</strong>, reload this page, then turn NordVPN <strong>on</strong> and reload again. Compare the results.</p>
          <p><a href="/api/vpn-diagnostic">Run the check again</a></p>
          <small>This is a temporary preview-only diagnostic. It does not bypass live-site security, enable blocking, or write a visitor analytics record.</small>
        </main></body></html>`;
        return new Response(page, {
          headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  },
});
