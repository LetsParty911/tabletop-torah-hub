// Server-only anonymous-network gate. Never trust browser-supplied VPN claims.
// Default is observation, not denial; set VPN_BLOCK_MODE=block after reviewing results.
// PROXYCHECK_API_KEY is optional (keyless tier has a lower daily quota).
import { waitUntil } from "@vercel/functions";
import { getRequestTelemetry, isAutomatedAgent } from "./request-telemetry.server";
import { shouldCheck } from "./geo-block.server";
import { isInternalRequest } from "./internal-marker.server";

export type VpnBlockMode = "off" | "monitor" | "block";
export type PrivacySignal = "VPN" | "Proxy" | "Tor";

export type PrivacyLookup = {
  signals: PrivacySignal[];
  confidence: number | null;
  operator: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
};

export function getVpnBlockMode(): VpnBlockMode {
  const v = (process.env["VPN_BLOCK_MODE"] ?? "monitor").trim().toLowerCase();
  return v === "off" || v === "block" ? v : "monitor";
}

const clean = (value: unknown, max = 120): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

/** The v3 API returns booleans; missing/failed results are NOT treated as clean IPs. */
export function parseProxycheckResponse(input: unknown, ip: string): PrivacyLookup | null {
  if (!input || typeof input !== "object") return null;
  const top = input as Record<string, unknown>;
  if (top.status !== "ok" && top.status !== "warning") return null;
  const row = top[ip];
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const detections = record.detections;
  if (!detections || typeof detections !== "object") return null;
  const d = detections as Record<string, unknown>;
  if (![d.vpn, d.proxy, d.tor].some((v) => typeof v === "boolean")) return null;

  const signals: PrivacySignal[] = [];
  if (d.vpn === true) signals.push("VPN");
  if (d.proxy === true) signals.push("Proxy");
  if (d.tor === true) signals.push("Tor");
  // Hosting alone, risk scores, and generic "anonymous" are not sufficient.
  const confidence = typeof d.confidence === "number" &&
    Number.isFinite(d.confidence) && d.confidence >= 0 && d.confidence <= 100
    ? d.confidence : null;
  const operator = record.operator && typeof record.operator === "object"
    ? clean((record.operator as Record<string, unknown>).name, 100) : null;
  const location = record.location && typeof record.location === "object"
    ? record.location as Record<string, unknown> : {};
  return {
    signals,
    confidence,
    operator,
    city: clean(location.city_name),
    region: clean(location.region_name),
    country: clean(location.country_code, 10),
  };
}

export function shouldDenyPrivacy(lookup: PrivacyLookup | null): boolean {
  // Require an explicit positive VPN/proxy/Tor classification with high confidence.
  return Boolean(lookup && lookup.signals.length > 0 &&
    lookup.confidence !== null && lookup.confidence >= 90);
}

const RESTRICTED_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Connection restricted — TorahForTheTable.com</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f2e7;color:#1b2a4a;font-family:Georgia,serif;text-align:center;padding:24px}main{max-width:580px}h1{font-size:1.1rem;letter-spacing:.08em;color:#b08a3e;margin:0 0 16px}h2{font-size:2rem;margin:0 0 12px}p{font:1rem/1.65 system-ui,sans-serif;color:#4a5570}</style></head><body><main><h1>TorahForTheTable.com</h1><h2>Connection Restricted</h2><p>Access is unavailable through your current network connection. Please turn off your VPN or proxy, then revisit our website using your regular internet connection.</p><p>If you are not using a VPN or proxy, try another connection. We apologize for the inconvenience.</p></main></body></html>`;

export function privacyRestrictedResponse(): Response {
  return new Response(RESTRICTED_PAGE, {
    status: 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, no-cache, max-age=0",
      "X-Robots-Tag": "noindex",
      "X-TFTT-Gate": "vpn-block",
    },
  });
}

type CheckResult = { value: PrivacyLookup | null; source: "provider" | "cache" | "inflight"; status: string; elapsed: number };
type Cached = { value: PrivacyLookup | null; status: string; expires: number };
const lookupCache = new Map<string, Cached>();
const inFlight = new Map<string, Promise<CheckResult>>();
const CACHE_MAX = 3000;
const POSITIVE_TTL = 10 * 60 * 1000;
const CLEAN_TTL = 60 * 60 * 1000;
const ERROR_TTL = 2 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 1200;

function validIp(ip: string | null): ip is string {
  return !!ip && ip.length <= 45 && /^[a-fA-F0-9:.]+$/.test(ip) &&
    (ip.includes(".") || ip.includes(":")) &&
    ip !== "127.0.0.1" && ip !== "0.0.0.0" && ip !== "::1";
}

async function fetchPrivacy(ip: string): Promise<{ value: PrivacyLookup | null; status: string }> {
  const url = new URL(`https://proxycheck.io/v3/${encodeURIComponent(ip)}`);
  const key = process.env["PROXYCHECK_API_KEY"]?.trim();
  if (key) url.searchParams.set("key", key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      method: "GET", signal: controller.signal, headers: { Accept: "application/json" },
    });
    if (!response.ok) return { value: null, status: `http_${response.status}` };
    const json = await response.json() as Record<string, unknown>;
    const value = parseProxycheckResponse(json, ip);
    return { value, status: value ? "ok" : `unclassified_${String(json.status ?? "unknown").slice(0, 30)}` };
  } catch (e) {
    return { value: null, status: e instanceof Error && e.name === "AbortError" ? "timeout" : "lookup_error" };
  } finally {
    clearTimeout(timer);
  }
}

async function privacyLookup(ip: string): Promise<CheckResult> {
  const before = Date.now();
  const cached = lookupCache.get(ip);
  if (cached && cached.expires > before) return { value: cached.value, source: "cache", status: cached.status, elapsed: 0 };
  const pending = inFlight.get(ip);
  if (pending) {
    const result = await pending;
    return { ...result, source: "inflight" };
  }
  const task: Promise<CheckResult> = (async () => {
    try {
      const result = await fetchPrivacy(ip);
      const ttl = !result.value ? ERROR_TTL : result.value.signals.length ? POSITIVE_TTL : CLEAN_TTL;
      if (lookupCache.size >= CACHE_MAX) lookupCache.delete(lookupCache.keys().next().value!);
      lookupCache.set(ip, { ...result, expires: Date.now() + ttl });
      return { value: result.value, status: result.status, source: "provider" as const, elapsed: Date.now() - before };
    } finally {
      inFlight.delete(ip);
    }
  })();
  inFlight.set(ip, task);
  return task;
}

async function auditPrivacy(
  request: Request, ip: string | null, mode: VpnBlockMode, result: CheckResult | null,
  automated: boolean, skippedReason?: string,
): Promise<void> {
  try {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
    const t = getRequestTelemetry(request);
    const url = new URL(request.url);
    const lookup = result?.value ?? null;
    const denied = mode === "block" && shouldDenyPrivacy(lookup);
    const verdict = skippedReason ? "skipped" : !lookup ? "unknown" : lookup.signals.length ? "detected" : "clean";
    const hostname = (() => { try { return new URL(request.headers.get("referer") ?? "").hostname.slice(0, 150) || null; } catch { return null; } })();
    const { error } = await getSupabaseAdmin().from("vpn_connection_checks").insert({
      ip_address: ip, country: lookup?.country ?? t.country, region: lookup?.region ?? t.region,
      city: lookup?.city ?? t.city, vpn_operator: lookup?.operator ?? null,
      user_agent: t.userAgent || null, referrer_host: hostname,
      request_path: (url.pathname + url.search).slice(0, 500),
      utm_source: url.searchParams.get("utm_source")?.slice(0, 100) ?? null,
      mode, decision: denied ? "blocked" : "allowed", verdict,
      signals: lookup?.signals ?? [], confidence: lookup?.confidence ?? null,
      lookup_source: skippedReason ? "skipped" : result?.source ?? "skipped",
      provider_status: skippedReason ?? result?.status ?? "unavailable",
      lookup_ms: result?.elapsed ?? null, error_code: skippedReason ??
        (lookup ? null : result?.status ?? "unknown"),
      is_automated: automated,
    });
    if (error) console.error("[vpn-block] audit insert failed", error.message);
  } catch (e) {
    console.error("[vpn-block] audit insert failed", e);
  }
}

/** Audit each eligible document navigation, including clean and failed classifications. */
export async function checkVpnBlock(request: Request): Promise<Response | null> {
  const mode = getVpnBlockMode();
  if (mode === "off") return null;
  try {
    const path = new URL(request.url).pathname;
    if (request.method !== "GET" || !shouldCheck(request, path)) return null;
    if (await isInternalRequest(request)) return null;
    const t = getRequestTelemetry(request);
    const ip = t.ipAddress;
    const automated = isAutomatedAgent(t.userAgent);
    // Never silently mistake a missing client address for a verified clean result.
    if (!validIp(ip)) {
      const audit = auditPrivacy(request, ip, mode, null, automated, "missing_or_invalid_ip");
      try { waitUntil(audit); } catch { await audit; }
      return null;
    }
    if (mode === "monitor" && automated) {
      const audit = auditPrivacy(request, ip, mode, null, automated, "automated_user_agent");
      try { waitUntil(audit); } catch { await audit; }
      return null;
    }
    if (mode === "monitor") {
      const task = privacyLookup(ip).then(result => auditPrivacy(request, ip, mode, result, automated));
      try { waitUntil(task); } catch { await task; }
      return null;
    }
    const result = await privacyLookup(ip);
    const denied = shouldDenyPrivacy(result.value);
    const audit = auditPrivacy(request, ip, mode, result, automated);
    try { waitUntil(audit); } catch { await audit; }
    return denied ? privacyRestrictedResponse() : null;
  } catch (e) {
    console.error("[vpn-block] gate failed open", e);
    return null;
  }
}

/** Isolated self-test for Vercel previews; never writes a visitor or VPN audit row. */
export async function previewVpnLookup(ip: string | null): Promise<CheckResult | null> {
  if (!validIp(ip)) return null;
  return privacyLookup(ip);
}
