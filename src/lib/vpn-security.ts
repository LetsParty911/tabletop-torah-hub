// Pure helpers for VPN detector attribution, provider-failure classification,
// alert suppression and Pushover message text. No I/O; unit-tested.

export const DETECTORS = {
  proxycheck: "Proxycheck",
  ipapi: "ipapi.is",
  strictVpn: "X4BNet VPN list",
  tor: "Tor exit list",
} as const;
export type DetectorName = (typeof DETECTORS)[keyof typeof DETECTORS];
export type ProviderKey = "proxycheck" | "ipapi" | "lists";
export type FailureCategory = "quota" | "credentials" | "failure";

type Signal = "VPN" | "Proxy" | "Tor";
export type ProviderResult = {
  ok: boolean;
  status: string;
  detected: boolean;
  signals?: Signal[];
  confidence?: number | null;
  failure?: FailureCategory | null;
};

export function classifyProviderFailure(provider: ProviderKey, status: string): FailureCategory | null {
  const s = status.toLowerCase();
  if (provider === "lists") return s === "lists_unavailable" ? "failure" : null;
  if (s === "ok") return null;
  if (provider === "ipapi" && (s === "not_configured")) return "credentials";
  if (/exhausted|quota|rate_limit|rate_limited|quota_paused/.test(s)) return "quota";
  if (/credential_denied|access_denied|http_401|http_403_(?!caller)/.test(s)) return "credentials";
  return "failure";
}

export function buildAttribution(input: {
  proxycheck: { signals: Signal[]; confidence: number | null } | null;
  proxycheckStatus: string;
  proxycheckQualifies: boolean;
  ipapi?: { vpn: boolean; proxy: boolean; tor: boolean } | null;
  ipapiStatus?: string;
  listSignal?: "VPN" | "Tor" | null;
  listStatus?: string;
}): { detectedBy: DetectorName[]; providerResults: Record<string, ProviderResult> } {
  const detectedBy: DetectorName[] = [];
  const results: Record<string, ProviderResult> = {};
  const pcFail = input.proxycheck ? null : classifyProviderFailure("proxycheck", input.proxycheckStatus);
  results[DETECTORS.proxycheck] = {
    ok: !!input.proxycheck, status: input.proxycheckStatus.slice(0, 120),
    detected: input.proxycheckQualifies,
    signals: input.proxycheck?.signals ?? [], confidence: input.proxycheck?.confidence ?? null,
    failure: pcFail,
  };
  if (input.proxycheckQualifies) detectedBy.push(DETECTORS.proxycheck);
  if (input.ipapiStatus !== undefined) {
    const v = input.ipapi ?? null;
    const sig: Signal[] = v ? ([v.vpn && "VPN", v.proxy && "Proxy", v.tor && "Tor"].filter(Boolean) as Signal[]) : [];
    results[DETECTORS.ipapi] = {
      ok: !!v, status: input.ipapiStatus.slice(0, 120), detected: sig.length > 0, signals: sig,
      failure: v ? null : classifyProviderFailure("ipapi", input.ipapiStatus),
    };
    if (sig.length) detectedBy.push(DETECTORS.ipapi);
  }
  if (input.listStatus !== undefined) {
    const fail = classifyProviderFailure("lists", input.listStatus);
    const ok = !fail;
    results[DETECTORS.strictVpn] = { ok, status: input.listStatus, detected: input.listSignal === "VPN", failure: fail };
    results[DETECTORS.tor] = { ok, status: input.listStatus, detected: input.listSignal === "Tor", failure: fail };
    if (input.listSignal === "VPN") detectedBy.push(DETECTORS.strictVpn);
    if (input.listSignal === "Tor") detectedBy.push(DETECTORS.tor);
  }
  return { detectedBy, providerResults: results };
}

export const BLOCK_SUPPRESS_MS = 30 * 60 * 1000;
export const FAILURE_SUPPRESS_MS = 6 * 60 * 60 * 1000;
export const FAILURE_THRESHOLD = 3;
export const FAILURE_WINDOW_MS = 10 * 60 * 1000;

export function blockDedupeKey(ip: string, now: number) {
  return `vpn_blocked:${ip}:${Math.floor(now / BLOCK_SUPPRESS_MS)}`;
}
export function failureDedupeKey(provider: ProviderKey, cat: FailureCategory, now: number) {
  return `provider_failure:${provider}:${cat}:${Math.floor(now / FAILURE_SUPPRESS_MS)}`;
}
export function bucketStart(now: number, size: number) {
  return new Date(Math.floor(now / size) * size).toISOString();
}

/** Per-isolate tracker. Quota/credential errors alert at once; generic failures
 * alert after FAILURE_THRESHOLD consecutive fresh failures within the window.
 * Each provider+category alerts at most once per FAILURE_SUPPRESS_MS. */
export class FailureTracker {
  private streak = new Map<ProviderKey, { count: number; first: number }>();
  private lastAlert = new Map<string, number>();
  record(provider: ProviderKey, cat: FailureCategory | null, now: number): FailureCategory | null {
    if (!cat) { this.streak.delete(provider); return null; }
    const s = this.streak.get(provider);
    const cur = s && now - s.first <= FAILURE_WINDOW_MS ? { count: s.count + 1, first: s.first } : { count: 1, first: now };
    this.streak.set(provider, cur);
    if (cat === "failure" && cur.count < FAILURE_THRESHOLD) return null;
    const key = provider + ":" + cat;
    const last = this.lastAlert.get(key);
    if (last !== undefined && now - last < FAILURE_SUPPRESS_MS) return null;
    this.lastAlert.set(key, now);
    return cat;
  }
  /** Per-IP block suppression inside the isolate (DB check covers other isolates). */
  private blocks = new Map<string, number>();
  shouldAlertBlock(ip: string, now: number): boolean {
    const last = this.blocks.get(ip);
    if (last !== undefined && now - last < BLOCK_SUPPRESS_MS) return false;
    if (this.blocks.size > 2000) this.blocks.clear();
    this.blocks.set(ip, now);
    return true;
  }
}

export function formatLocation(city?: string | null, region?: string | null, country?: string | null) {
  return [city, region, country].filter(Boolean).join(", ") || "Location unknown";
}

export function blockMessage(a: { ip: string; location: string; detectedBy: string[]; signals: string[]; path: string }) {
  return {
    title: "TFTT — VPN/proxy blocked",
    message: [
      `IP: ${a.ip}`,
      `Location: ${a.location}`,
      `Detected by: ${a.detectedBy.join(", ") || "unattributed"}`,
      `Type: ${a.signals.join(", ") || "unknown"}`,
      `Page: ${a.path.split("?")[0]}`,
      "Further blocks from this IP are muted for 30 min.",
    ].join("\n"),
  };
}

const PROVIDER_LABEL: Record<ProviderKey, string> = { proxycheck: "Proxycheck", ipapi: "ipapi.is", lists: "VPN/Tor lists" };
export function failureMessage(provider: ProviderKey, cat: FailureCategory, status: string) {
  const what = cat === "quota" ? "ran out of quota / is rate-limited" : cat === "credentials" ? "rejected the API key" : "is failing repeatedly";
  return {
    title: `TFTT — ${PROVIDER_LABEL[provider]} ${cat === "failure" ? "failing" : "problem"}`,
    message: `${PROVIDER_LABEL[provider]} ${what}.\nLast status: ${status.slice(0, 80)}\nOther detection layers keep running. Repeat alerts muted for 6 hours.`,
  };
}
