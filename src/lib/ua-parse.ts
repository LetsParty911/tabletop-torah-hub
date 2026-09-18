// Small dependency-free User-Agent parser. Intentionally conservative:
// when a token is not recognized we return "Unknown" and callers keep the raw UA.

export type ParsedUa = {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceCategory: string;
};

const UNKNOWN: ParsedUa = {
  browser: "Unknown",
  browserVersion: "",
  os: "Unknown",
  osVersion: "",
  deviceCategory: "unknown",
};

function match(ua: string, re: RegExp): string {
  const m = ua.match(re);
  return m?.[1] ? m[1].replace(/_/g, ".") : "";
}

function parseBrowser(ua: string): { browser: string; browserVersion: string } {
  // Order matters: many browsers also contain "Safari" / "Chrome" tokens.
  if (/\bEdgA?\/|\bEdgiOS\/|\bEdge\//i.test(ua))
    return { browser: "Edge", browserVersion: match(ua, /\bEdg(?:A|iOS|e)?\/([\d.]+)/i) };
  if (/\bOPR\/|\bOpera/i.test(ua))
    return { browser: "Opera", browserVersion: match(ua, /\b(?:OPR|Opera)\/([\d.]+)/i) };
  if (/\bSamsungBrowser\//i.test(ua))
    return { browser: "Samsung Internet", browserVersion: match(ua, /SamsungBrowser\/([\d.]+)/i) };
  if (/\bFxiOS\//i.test(ua))
    return { browser: "Firefox (iOS)", browserVersion: match(ua, /FxiOS\/([\d.]+)/i) };
  if (/\bFirefox\//i.test(ua))
    return { browser: "Firefox", browserVersion: match(ua, /Firefox\/([\d.]+)/i) };
  if (/\bCriOS\//i.test(ua))
    return { browser: "Chrome (iOS)", browserVersion: match(ua, /CriOS\/([\d.]+)/i) };
  if (/\bwv\)/i.test(ua) && /\bChrome\//i.test(ua))
    return { browser: "Android WebView", browserVersion: match(ua, /Chrome\/([\d.]+)/i) };
  if (/\bChrome\//i.test(ua))
    return { browser: "Chrome", browserVersion: match(ua, /Chrome\/([\d.]+)/i) };
  if (/\bSafari\//i.test(ua) && /\bVersion\//i.test(ua))
    return { browser: "Safari", browserVersion: match(ua, /Version\/([\d.]+)/i) };
  if (/AppleWebKit\//i.test(ua) && /\b(iPhone|iPad|iPod)\b/i.test(ua))
    return { browser: "iOS WebView", browserVersion: "" };
  return { browser: "Unknown", browserVersion: "" };
}

function parseOs(ua: string): { os: string; osVersion: string } {
  if (/\bCrOS\b/i.test(ua)) return { os: "ChromeOS", osVersion: match(ua, /CrOS \S+ ([\d.]+)/i) };
  if (/\bAndroid\b/i.test(ua)) return { os: "Android", osVersion: match(ua, /Android ([\d.]+)/i) };
  if (/\biPhone\b|\biPod\b/i.test(ua))
    return { os: "iOS", osVersion: match(ua, /OS ([\d_]+) like Mac/i) };
  if (/\biPad\b/i.test(ua)) return { os: "iPadOS", osVersion: match(ua, /OS ([\d_]+) like Mac/i) };
  if (/Windows NT/i.test(ua)) {
    const nt = match(ua, /Windows NT ([\d.]+)/i);
    const map: Record<string, string> = {
      "10.0": "10/11",
      "6.3": "8.1",
      "6.2": "8",
      "6.1": "7",
    };
    return { os: "Windows", osVersion: map[nt] ?? nt };
  }
  if (/Mac OS X/i.test(ua))
    return { os: "macOS", osVersion: match(ua, /Mac OS X ([\d_.]+)/i) };
  if (/\bLinux\b/i.test(ua)) return { os: "Linux", osVersion: "" };
  return { os: "Unknown", osVersion: "" };
}

function parseDeviceCategory(ua: string, os: string): string {
  if (/\biPad\b/i.test(ua) || os === "iPadOS") return "tablet";
  if (/\bTablet\b/i.test(ua) || (/\bAndroid\b/i.test(ua) && !/\bMobile\b/i.test(ua)))
    return "tablet";
  if (/\bMobile\b|\biPhone\b|\biPod\b/i.test(ua)) return "mobile";
  if (os === "Unknown") return "unknown";
  return "desktop";
}

export function parseUserAgent(raw: string | null | undefined, deviceHint?: string | null): ParsedUa {
  const ua = (raw ?? "").trim();
  if (!ua) {
    const hint = (deviceHint ?? "").trim();
    return { ...UNKNOWN, deviceCategory: hint || "unknown" };
  }
  const { browser, browserVersion } = parseBrowser(ua);
  const { os, osVersion } = parseOs(ua);
  let deviceCategory = parseDeviceCategory(ua, os);
  if (deviceCategory === "unknown" && deviceHint?.trim()) deviceCategory = deviceHint.trim();
  return { browser, browserVersion, os, osVersion, deviceCategory };
}

export function formatUaSummary(parsed: ParsedUa): string {
  const browser = parsed.browserVersion
    ? `${parsed.browser} ${parsed.browserVersion.split(".")[0]}`
    : parsed.browser;
  const os = parsed.osVersion ? `${parsed.os} ${parsed.osVersion}` : parsed.os;
  return `${browser} · ${os}`;
}
