// Server-only anonymous-network gate. Never trust browser-supplied VPN claims.
// Default is observation, not denial; set VPN_BLOCK_MODE=block after reviewing results.
// PROXYCHECK_API_KEY is optional (keyless tier has a lower daily quota).
import { waitUntil } from "@vercel/functions";
import { getRequestTelemetry, isAutomatedAgent } from "./request-telemetry.server";
import { shouldCheck } from "./geo-block.server";
import { isInternalRequest } from "./internal-marker.server";
import { isTrustedVpnBrowser } from "./trusted-vpn-browser.server";

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

/** Temporary owner-requested exception; turn off to restore Brooklyn VPN blocking. */
export const TEMP_ALLOW_BROOKLYN_VPN = true;

/** A Brooklyn match is about the VPN exit IP, not proof of a visitor's real location. */
export function isTemporaryBrooklynVpnException(
  location: Pick<PrivacyLookup, "city" | "region" | "country"> | null | undefined,
  vpnDetected: boolean,
  torDetected: boolean,
): boolean {
  if (!TEMP_ALLOW_BROOKLYN_VPN || !vpnDetected || torDetected) return false;
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  return norm(location?.city) === "brooklyn" &&
    ["new york", "ny"].includes(norm(location?.region)) &&
    ["us", "usa", "united states"].includes(norm(location?.country));
}

// Fail safely to monitoring if the runtime configuration lookup is unavailable.
let modeMemo: { mode: VpnBlockMode; expires: number } | null = null;
export async function getVpnBlockMode(): Promise<VpnBlockMode> {
  if (modeMemo && modeMemo.expires > Date.now()) return modeMemo.mode;
  try {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
    const { data, error } = await getSupabaseAdmin().from("vpn_block_settings")
      .select("mode").eq("id", 1).single();
    if (error) throw error;
    const mode = data?.mode;
    if (mode !== "off" && mode !== "monitor" && mode !== "block") throw Error("Invalid VPN mode");
    modeMemo = { mode, expires: Date.now() + 10_000 };
    return mode;
  } catch (error) {
    console.error("[vpn-block] failed to read mode; defaulting to monitoring", error);
    return "monitor";
  }
}
export function clearVpnModeCache() { modeMemo = null; }

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

/** Single policy function for the response and its audit record. */
export function shouldBlockPrivacy(
  lookup: PrivacyLookup | null, additionalBlock: boolean, brooklynVpnException: boolean,
): boolean {
  return !brooklynVpnException && (shouldDenyPrivacy(lookup) || additionalBlock);
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

type CheckResult = { value: PrivacyLookup | null; source: "provider" | "cache" | "inflight"; status: string; elapsed: number; additionalBlock?: boolean; brooklynVpnException?: boolean };
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

/** Recognize only fixed error categories. Never persist the provider's raw body,
 * which can include searched IP addresses, request URLs or credential details.
 */
export function classifyProxycheckDenial(httpStatus: number, body: string): string {
  const sample = body.slice(0, 4096).toLowerCase();
  // Proxycheck publishes distinct 100-query keyless and 1,000-query keyed denials.
  // Classifying them before generic quota/burst text preserves the diagnostic.
  if (/\b1[,.]?000\s+free\s+queries?\s+exhausted\b/.test(sample)) return "registered_1000_exhausted";
  if (/\b100\s+queries?\s+exhausted\b/.test(sample)) return "unregistered_100_exhausted";
  if (/rate.?limit|too many requests|burst.?token|requests? per second/.test(sample)) return "rate_limited";
  if (/quota|queries? (?:exceeded|exhausted|remaining)|daily limit|query limit|no queries/.test(sample)) return "quota_exhausted";
  if (/invalid (?:api[ -]?)?key|key (?:invalid|incorrect|expired|revoked)|unauthori[sz]ed|authentication/.test(sample)) return "credential_denied";
  if (/originat(?:es|ing) from a proxy|request(?:er|ing ip)? (?:is |behind )?(?:a )?proxy|vpn (?:detected|access)|proxy (?:detected|access)|proxy traffic/.test(sample)) return "caller_proxy_denied";
  if (/access denied|forbidden|permission denied|blocked/.test(sample)) return "access_denied";
  if (httpStatus === 429) return "rate_limited";
  return "unclassified_denial";
}

type ProxycheckKeyChoice = {
  key: string | null;
  source: "worker" | "process" | "missing";
  mismatch: boolean;
  formatUnusual: boolean;
};

/**
 * Prefer the live Lovable/Cloudflare Worker secret binding over process.env.
 * The latter may be absent or stale in Workers. Neither value is ever logged.
 */
export function chooseProxycheckKey(workerValue: unknown, processValue: unknown): ProxycheckKeyChoice {
  const normalized = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  const worker = normalized(workerValue);
  const node = normalized(processValue);
  const key = worker ?? node;
  return {
    key,
    source: worker ? "worker" : node ? "process" : "missing",
    mismatch: Boolean(worker && node && worker !== node),
    // Diagnostic only; don't reject a working key if Proxycheck changes its format.
    formatUnusual: Boolean(key && !/^[a-z0-9]{6}(?:-[a-z0-9]{6}){3}$/i.test(key)),
  };
}

/** Read the secret provided to the request by the Lovable Cloudflare adapter.
 * The adapter exposes request.runtime.cloudflare.env for server middleware;
 * this is NOT a browser-supplied header, query string or request body.
 * Vercel/Node requests do not carry that binding.
 */
export function getWorkerProxycheckBinding(request: Request): unknown {
  const runtime = (request as Request & {
    runtime?: { cloudflare?: { env?: Record<string, unknown> } };
  }).runtime;
  return runtime?.cloudflare?.env?.["PROXYCHECK_API_KEY"];
}

export function readProxycheckKey(request: Request): ProxycheckKeyChoice {
  const workerValue = getWorkerProxycheckBinding(request);
  const processValue = typeof process === "undefined" ? undefined : process.env["PROXYCHECK_API_KEY"];
  return chooseProxycheckKey(workerValue, processValue);
}

export function proxycheckKeyShape(value: string | null): string {
  if (!value) return "missing";
  if (/^[a-z0-9]{6}(?:-[a-z0-9]{6}){3}$/i.test(value)) return "standard";
  if (/^PROXYCHECK_API_KEY\s*=/i.test(value)) return "assignment";
  if (/^https?:/i.test(value)) return "url";
  if (value.startsWith('"') || value.endsWith('"')) return "quoted";
  if (value.includes("\n") || value.includes("\r")) return "multiline";
  if (/\s/.test(value)) return "whitespace";
  if (/^[a-z0-9]{24}$/i.test(value)) return "missing_hyphens";
  if (/^[a-z0-9-]+$/i.test(value)) return "wrong_grouping";
  return "other";
}

async function fetchPrivacy(ip: string, keyChoice: ProxycheckKeyChoice): Promise<{ value: PrivacyLookup | null; status: string }> {
  const url = new URL(`https://proxycheck.io/v3/${encodeURIComponent(ip)}`);
  if (keyChoice.key) url.searchParams.set("key", keyChoice.key);
  // Only the source, presence, disagreement and format category can be saved.
  const keyCategory = !keyChoice.key ? "key_missing" :
    `key_present_${keyChoice.source}${keyChoice.mismatch ? "_mismatch" : ""}${keyChoice.formatUnusual ? `_format_${proxycheckKeyShape(keyChoice.key)}` : ""}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      method: "GET", signal: controller.signal, headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      // The response is inspected only transiently; no raw provider text is logged or saved.
      let denialText = "";
      try { denialText = (await response.text()).slice(0, 4096); } catch { /* unavailable body */ }
      const category = classifyProxycheckDenial(response.status, denialText);
      return { value: null, status: `http_${response.status}_${category}_${keyCategory}` };
    }
    const json = await response.json() as Record<string, unknown>;
    const value = parseProxycheckResponse(json, ip);
    return { value, status: value ? "ok" : `unclassified_${String(json.status ?? "unknown").slice(0, 30)}` };
  } catch (e) {
    return { value: null, status: e instanceof Error && e.name === "AbortError" ? "timeout" : "lookup_error" };
  } finally {
    clearTimeout(timer);
  }
}

async function privacyLookup(ip: string, keyChoice: ProxycheckKeyChoice): Promise<CheckResult> {
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
      const result = await fetchPrivacy(ip, keyChoice);
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

type Attribution = { detectedBy: string[]; providerResults: Record<string, unknown> };

/** Prefer the Cloudflare request context; fall back to Vercel, else await inline. */
function runBackground(request: Request, task: Promise<unknown>): Promise<unknown> | null {
  const ctx = (request as unknown as { runtime?: { cloudflare?: { context?: { waitUntil?: (p: Promise<unknown>) => void } } } }).runtime?.cloudflare?.context;
  if (ctx?.waitUntil) { ctx.waitUntil(task); return null; }
  try { waitUntil(task); return null; } catch { return task; }
}

/** Fallback log in Lovable Cloud when the analytics-database audit write fails. */
async function recordAuditFailure(row: Record<string, unknown>, category: string, message: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("vpn_audit_failures").insert({
      error_category: category, error_message: message.slice(0, 300),
      decision: String(row.decision), verdict: (row.verdict as string) ?? null,
      detected_by: (row.detected_by as string[]) ?? [], ip_address: (row.ip_address as string) ?? null,
      country: (row.country as string) ?? null, region: (row.region as string) ?? null,
      city: (row.city as string) ?? null, request_path: (row.request_path as string) ?? null,
    });
    if (error) console.error("[vpn-block] audit-failure log also failed", error.code);
  } catch (e) {
    console.error("[vpn-block] audit-failure log also failed", e instanceof Error ? e.name : "unknown");
  }
}

export async function auditPrivacy(
  request: Request, ip: string | null, mode: VpnBlockMode, result: CheckResult | null,
  automated: boolean, skippedReason?: string, attribution?: Attribution,
): Promise<{ id: string | null; row: Record<string, unknown> }> {
  const t = getRequestTelemetry(request);
  const url = new URL(request.url);
  const lookup = result?.value ?? null;
  const denied = mode === "block" && shouldBlockPrivacy(lookup, Boolean(result?.additionalBlock), Boolean(result?.brooklynVpnException));
  const verdict = skippedReason ? "skipped" : result?.additionalBlock ? "detected" : !lookup ? "unknown" : lookup.signals.length ? "detected" : "clean";
  const hostname = (() => { try { return new URL(request.headers.get("referer") ?? "").hostname.slice(0, 150) || null; } catch { return null; } })();
  const row: Record<string, unknown> = {
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
    detected_by: attribution?.detectedBy ?? [],
    provider_results: attribution?.providerResults ?? {},
  };
  let lastErr = "unknown";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
      const { data, error } = await getSupabaseAdmin().from("vpn_connection_checks").insert(row).select("id").single();
      if (!error) return { id: (data?.id as string) ?? null, row };
      lastErr = `${error.code ?? "db_error"}: ${error.message ?? ""}`;
    } catch (e) {
      lastErr = e instanceof Error ? `${e.name}: ${e.message}` : "unknown";
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 250));
  }
  console.error("[vpn-block] audit insert failed after retry");
  await recordAuditFailure(row, lastErr.startsWith("Error: Missing env") ? "config" : "insert_failed", lastErr);
  return { id: null, row };
}

/** Audit each eligible document navigation, including clean and failed classifications. */
export async function checkVpnBlock(request: Request): Promise<Response | null> {
  // This capability skips ONLY this gate, not downstream geo/IP or site/PDF gates.
  // Check before mode/audit/provider work; failures never grant an exemption.
  if (await isTrustedVpnBrowser(request)) return null;
  const mode = await getVpnBlockMode();
  if (mode === "off") return null;
  let denied = false;
  try {
    const path = new URL(request.url).pathname;
    if (request.method !== "GET" || !shouldCheck(request, path)) return null;
    if (await isInternalRequest(request)) return null;
    const t = getRequestTelemetry(request);
    const ip = t.ipAddress;
    const automated = isAutomatedAgent(t.userAgent);
    if (!validIp(ip)) {
      const p = runBackground(request, auditPrivacy(request, ip, mode, null, automated, "missing_or_invalid_ip"));
      if (p) await p;
      return null;
    }
    if (mode === "monitor" && automated) {
      const p = runBackground(request, auditPrivacy(request, ip, mode, null, automated, "automated_user_agent"));
      if (p) await p;
      return null;
    }
    const keyChoice = readProxycheckKey(request);
    const { buildAttribution, classifyProviderFailure } = await import("./vpn-security");
    const notify = await import("./vpn-notify.server");
    const env = notify.workerEnv(request);
    if (mode === "monitor") {
      const task = privacyLookup(ip, keyChoice).then(async result => {
        const attribution = buildAttribution({ proxycheck: result.value, proxycheckStatus: result.status, proxycheckQualifies: shouldDenyPrivacy(result.value) });
        await auditPrivacy(request, ip, mode, result, automated, undefined, attribution);
        if (result.source === "provider") await notify.recordProviderOutcome(env, "proxycheck", result.value ? null : classifyProviderFailure("proxycheck", result.status), result.status);
      });
      const p = runBackground(request, task);
      if (p) await p;
      return null;
    }
    const { checkKnownNetwork } = await import("./known-vpn-lists.server");
    const { checkIpapi, getIpapiKey } = await import("./ipapi-privacy.server");
    // All three sources are independent: a Proxycheck "clean" does not
    // override an explicit detection by ipapi.is or the strict public lists.
    const [primary, secondary, listed] = await Promise.all([
      privacyLookup(ip, keyChoice),
      checkIpapi(ip, getIpapiKey(request)),
      checkKnownNetwork(ip),
    ]);
    const listSignal = listed.signal;
    const ipapiSignals: PrivacySignal[] = secondary.value
      ? (["VPN", "Proxy", "Tor"] as const).filter(s =>
          s === "VPN" ? secondary.value?.vpn : s === "Proxy" ? secondary.value?.proxy : secondary.value?.tor)
      : [];
    const additionalBlock = Boolean(listSignal || ipapiSignals.length);
    const additionalValue: PrivacyLookup | null = additionalBlock ? {
      signals: [...new Set([...ipapiSignals, ...(listSignal ? [listSignal] : [])])] as PrivacySignal[],
      confidence: null,
      operator: secondary.value?.operator ?? (listSignal ? "Public strict list" : null),
      city: null, region: null, country: null,
    } : null;
    const selected = shouldDenyPrivacy(primary.value) ? primary.value :
      additionalValue ?? primary.value;
    const providerStatus = [
      "proxycheck:" + primary.status,
      "ipapi:" + secondary.status,
      "lists:" + listed.status,
    ].join(";");
    // Exempt only VPN-positive Brooklyn, NY exit IPs. Proxy-only and Tor
    // detections keep their existing blocking policy everywhere.
    const vpnDetected = Boolean(
      (shouldDenyPrivacy(primary.value) && primary.value?.signals.includes("VPN")) ||
      secondary.value?.vpn === true || listSignal === "VPN"
    );
    const torDetected = Boolean(
      primary.value?.signals.includes("Tor") ||
      secondary.value?.tor === true || listSignal === "Tor"
    );
    let brooklynVpnException =
      isTemporaryBrooklynVpnException(primary.value, vpnDetected, torDetected) ||
      isTemporaryBrooklynVpnException(t, vpnDetected, torDetected);

    // Proxycheck may lack city data or identify a Brooklyn exit as "New York".
    // On VPN detections only, consult the existing blocking geo provider/cache
    // in those cases. A failed lookup never creates an exemption.
    if (vpnDetected && !torDetected && !brooklynVpnException) {
      const p = primary.value;
      const completeLocation = Boolean(p?.city && p?.region && p?.country);
      const region = (p?.region ?? "").trim().toLowerCase();
      const country = (p?.country ?? "").trim().toLowerCase();
      const mayBeNewYork = ["new york", "ny"].includes(region) &&
        ["us", "usa", "united states"].includes(country);
      if (!completeLocation || mayBeNewYork) {
        try {
          const { resolveApproximateGeo } = await import("./ip-geo.server");
          const { memoizedLookup, BLOCK_MEMO_TTL_MS, NEGATIVE_MEMO_TTL_MS } = await import("./geo-block-memo");
          const geo = await memoizedLookup(ip, () => resolveApproximateGeo(t, "blocking"),
            undefined, v => v?.city ? BLOCK_MEMO_TTL_MS : NEGATIVE_MEMO_TTL_MS);
          brooklynVpnException = isTemporaryBrooklynVpnException(geo, vpnDetected, torDetected);
        } catch {
          // Preserve the existing VPN block when exit-IP geography is unavailable.
        }
      }
    }

    const result: CheckResult = {
      value: selected, source: primary.source,
      status: providerStatus + (brooklynVpnException ? ";policy:temporary_brooklyn_vpn_exception" : ""),
      elapsed: Math.max(primary.elapsed,secondary.elapsed),
      additionalBlock, brooklynVpnException,
    };
    // Decide BEFORE any logging: the response and audit use the same policy.
    denied = shouldBlockPrivacy(primary.value, additionalBlock, brooklynVpnException);
    const attribution = buildAttribution({
      proxycheck: primary.value, proxycheckStatus: primary.status, proxycheckQualifies: shouldDenyPrivacy(primary.value),
      ipapi: secondary.value, ipapiStatus: secondary.status, listSignal, listStatus: listed.status,
    });
    const task = (async () => {
      const audit = await auditPrivacy(request, ip, mode, result, automated, undefined, attribution);
      if (primary.source === "provider") await notify.recordProviderOutcome(env, "proxycheck", primary.value ? null : classifyProviderFailure("proxycheck", primary.status), primary.status);
      if (secondary.source === "provider" || secondary.status === "not_configured") await notify.recordProviderOutcome(env, "ipapi", secondary.value ? null : classifyProviderFailure("ipapi", secondary.status), secondary.status);
      await notify.recordProviderOutcome(env, "lists", classifyProviderFailure("lists", listed.status), listed.status);
      if (denied) {
        const r = audit.row;
        const { formatLocation } = await import("./vpn-security");
        await notify.notifyBlocked(env, {
          auditId: audit.id, ip, location: formatLocation(r.city as string, r.region as string, r.country as string),
          detectedBy: attribution.detectedBy, signals: selected?.signals ?? [], path: String(r.request_path),
        });
      }
    })().catch(() => { /* every step logs its own failure */ });
    // On runtimes without background support the task is awaited, but a
    // denied visitor still gets the 403 even if the task throws.
    const p = runBackground(request, task);
    if (p) await p.catch(() => {});
    return denied ? privacyRestrictedResponse() : null;
  } catch (e) {
    console.error("[vpn-block] gate failed open", e);
    return denied ? privacyRestrictedResponse() : null;
  }
}

/** Isolated self-test for Vercel previews; never writes a visitor or VPN audit row. */
export async function previewVpnLookup(ip: string | null): Promise<CheckResult | null> {
  if (!validIp(ip)) return null;
  return privacyLookup(ip, chooseProxycheckKey(undefined, typeof process === "undefined" ? undefined : process.env["PROXYCHECK_API_KEY"]));
}
