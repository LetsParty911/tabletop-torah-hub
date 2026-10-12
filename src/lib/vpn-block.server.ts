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

type Cached = { value: PrivacyLookup | null; expires: number };
const lookupCache = new Map<string, Cached>();
const inFlight = new Map<string, Promise<PrivacyLookup | null>>();
const lastMonitored = new Map<string, number>();
const CACHE_MAX = 3000;
const POSITIVE_TTL = 10 * 60 * 1000; // provider suggests <= 15m
const CLEAN_TTL = 60 * 60 * 1000; // provider suggests <= 1h
const ERROR_TTL = 2 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 1200;

function validIp(ip: string | null): ip is string {
  return !!ip && ip.length <= 45 && /^[a-fA-F0-9:.]+$/.test(ip) &&
    (ip.includes(".") || ip.includes(":")) &&
    ip !== "127.0.0.1" && ip !== "0.0.0.0" && ip !== "::1";
}

async function fetchPrivacy(ip: string): Promise<PrivacyLookup | null> {
  const url = new URL(`https://proxycheck.io/v3/${encodeURIComponent(ip)}`);
  const key = process.env["PROXYCHECK_API_KEY"]?.trim();
  if (key) url.searchParams.set("key", key);
  // Do not store positive-query tags in proxycheck's dashboard.
  url.searchParams.set("tag", "0");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      method: "GET", signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null; // quota/network failure: fail open
    return parseProxycheckResponse(await response.json(), ip);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function privacyLookup(ip: string): Promise<PrivacyLookup | null> {
  const now = Date.now();
  const cached = lookupCache.get(ip);
  if (cached && cached.expires > now) return cached.value;
  const pending = inFlight.get(ip);
  if (pending) return pending;

  const task = (async () => {
    try {
      const value = await fetchPrivacy(ip);
      const ttl = value === null ? ERROR_TTL :
        value.signals.length > 0 ? POSITIVE_TTL : CLEAN_TTL;
      if (lookupCache.size >= CACHE_MAX) lookupCache.delete(lookupCache.keys().next().value!);
      lookupCache.set(ip, { value, expires: Date.now() + ttl });
      return value;
    } finally {
      inFlight.delete(ip);
    }
  })();
  inFlight.set(ip, task);
  return task;
}

async function logPrivacyDetection(
  request: Request, ip: string, lookup: PrivacyLookup, blocked: boolean,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const url = new URL(request.url);
    const reason = `${lookup.signals.join("+")} detected by proxycheck` +
      ` (confidence ${lookup.confidence ?? "unknown"}${lookup.operator ? `, ${lookup.operator}` : ""})`;
    const telemetry = getRequestTelemetry(request);
    const { error } = await supabaseAdmin.from("blocked_visits").insert({
      ip_address: ip,
      city: lookup.city ?? telemetry.city,
      region: lookup.region ?? telemetry.region,
      country: lookup.country ?? telemetry.country,
      postal_code: telemetry.postalCode,
      geo_source: "ip_lookup",
      geo_provider: "proxycheck",
      path: (url.pathname + url.search).slice(0, 500),
      referrer: request.headers.get("referer")?.slice(0, 500) ?? null,
      user_agent: telemetry.userAgent || null,
      blocked,
      block_reason: reason,
      action: blocked ? "VPN/proxy connection denied" : "VPN/proxy detected — monitor only",
    });
    if (error) console.error("[vpn-block] audit log failed", error.message);
  } catch (e) {
    console.error("[vpn-block] audit log failed", e);
  }
}

async function evaluatePrivacy(request: Request, ip: string, mode: VpnBlockMode): Promise<Response | null> {
  const result = await privacyLookup(ip);
  if (!result || result.signals.length === 0) return null;
  const blocked = mode === "block" && shouldDenyPrivacy(result);
  // Monitor every detected IP only once per cache window; log actual blocks on every attempt.
  const key = `${ip}:${result.signals.join("+")}`;
  const now = Date.now();
  if (blocked || !lastMonitored.get(key) || now - lastMonitored.get(key)! >= POSITIVE_TTL) {
    lastMonitored.set(key, now);
    if (lastMonitored.size > CACHE_MAX) lastMonitored.delete(lastMonitored.keys().next().value!);
    await logPrivacyDetection(request, ip, result, blocked);
  }
  return blocked ? privacyRestrictedResponse() : null;
}

/** Called ahead of site routes. Monitor mode never holds up page rendering. */
export async function checkVpnBlock(request: Request): Promise<Response | null> {
  const mode = getVpnBlockMode();
  if (mode === "off") return null;
  try {
    const path = new URL(request.url).pathname;
    if (request.method !== "GET" || !shouldCheck(request, path)) return null;
    // Never lock the owner out of the admin site or their marked devices.
    if (await isInternalRequest(request)) return null;
    const telemetry = getRequestTelemetry(request);
    const ip = telemetry.ipAddress;
    if (!validIp(ip)) return null;
    // Avoid spending the free provider quota on obvious automated fetches
    // while auditing. In block mode, do not rely on a spoofable User-Agent bypass.
    if (mode === "monitor" && isAutomatedAgent(telemetry.userAgent)) return null;
    if (mode === "monitor") {
      const task = evaluatePrivacy(request, ip, mode).then(() => {});
      try {
        waitUntil(task);
      } catch {
        await task; // Fallback in non-Cloudflare environments
      }
      return null;
    }
    return await evaluatePrivacy(request, ip, mode);
  } catch (e) {
    console.error("[vpn-block] gate failed open", e);
    return null;
  }
}
