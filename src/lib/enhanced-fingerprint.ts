// Enhanced first-party device/browser fingerprint.
//
// IMPORTANT: the value produced here is a PROBABILISTIC DEVICE/BROWSER
// IDENTIFIER, not a person's identity. It exists to distinguish automated
// traffic from real visitors, recognise duplicate/repeat browser activity,
// protect the site from abuse, and diagnose browser/device compatibility.
// It is never linked to subscriber emails and never shared with third parties.
//
// Minimisation rules baked in below:
//  - raw canvas pixels / base64 are never kept, only a SHA-256 hash
//  - the detected font list is never kept, only a hash + a count
//  - no attempt is made to bypass browser privacy protections; if a signal is
//    reduced or unavailable we simply record what we can
//  - any individual API failing must never break the page or the rest of the
//    collection

import { getSessionId, getVisitorId, isAdminPath } from "@/lib/first-party-analytics";

export const FINGERPRINT_VERSION = "v1";

const ENDPOINT = "/api/enhanced-fingerprint";
const SENT_SESSION_KEY = "tftt:enhanced-fp-session";

export type ConsentMode = "not_required" | "consented";

export type FingerprintPayload = {
  visitor_id: string;
  session_id: string;
  consent_mode: ConsentMode;
  fingerprint_version: string;
  fingerprint_hash: string | null;
  canvas_hash: string | null;
  font_hash: string | null;
  font_count: number | null;
  webgl_hash: string | null;
  webgl_vendor: string | null;
  webgl_renderer: string | null;
  audio_hash: string | null;
  hardware_concurrency: number | null;
  device_memory: number | null;
  screen_width: number | null;
  screen_height: number | null;
  pixel_ratio: number | null;
  color_depth: number | null;
  timezone: string | null;
  timezone_offset: number | null;
  language: string | null;
  languages: string[] | null;
  platform: string | null;
  max_touch_points: number | null;
  connection_effective_type: string | null;
  connection_downlink: number | null;
  connection_rtt: number | null;
  connection_save_data: boolean | null;
  ua_ch_platform: string | null;
  ua_ch_mobile: boolean | null;
  ua_ch_brands: unknown[] | null;
  ua_high_entropy: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

async function sha256(input: string): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

async function safe<T>(fn: () => Promise<T> | T): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Individual signals
// ---------------------------------------------------------------------------

async function canvasHash(): Promise<string | null> {
  return safe(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.textBaseline = "top";
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = "#f2e9d8";
    ctx.fillRect(0, 0, 240, 60);
    ctx.fillStyle = "#123a5e";
    ctx.fillText("Torah for the Table \u2014 fp\u00b7v1", 4, 8);
    ctx.strokeStyle = "rgba(196,154,63,0.8)";
    ctx.beginPath();
    ctx.arc(60, 40, 16, 0, Math.PI * 2);
    ctx.stroke();
    // Only the hash of the rendering is retained — never the image data.
    const data = canvas.toDataURL();
    return await sha256(data);
  });
}

// A modest, static list. We measure text width for each candidate against
// fallback fonts; no local font enumeration API is used and no file system is
// touched.
const FONT_CANDIDATES = [
  "Arial", "Arial Black", "Arial Narrow", "Calibri", "Cambria", "Candara",
  "Comic Sans MS", "Consolas", "Courier New", "Franklin Gothic Medium",
  "Garamond", "Georgia", "Helvetica", "Helvetica Neue", "Impact",
  "Lucida Console", "Lucida Grande", "Lucida Sans Unicode", "Menlo", "Monaco",
  "Palatino", "Palatino Linotype", "Segoe UI", "Tahoma", "Times New Roman",
  "Trebuchet MS", "Verdana", "Optima", "Futura", "Gill Sans", "Baskerville",
  "Noto Sans", "Roboto", "Ubuntu", "Cantarell", "DejaVu Sans", "Liberation Sans",
];

async function fontSignal(): Promise<{ hash: string | null; count: number | null }> {
  const result = await safe(async () => {
    const baseFonts = ["monospace", "sans-serif", "serif"];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const text = "mmmmmmmmmmlli0Oo";
    const size = "72px";

    const baseline: Record<string, number> = {};
    for (const base of baseFonts) {
      ctx.font = `${size} ${base}`;
      baseline[base] = ctx.measureText(text).width;
    }

    const detected: string[] = [];
    for (const font of FONT_CANDIDATES) {
      let present = false;
      for (const base of baseFonts) {
        ctx.font = `${size} '${font}', ${base}`;
        if (Math.abs(ctx.measureText(text).width - (baseline[base] ?? 0)) > 0.5) {
          present = true;
          break;
        }
      }
      if (present) detected.push(font);
    }
    // Only the hash + count are stored; the detected list never leaves here.
    return { hash: await sha256(detected.join("|")), count: detected.length };
  });
  return result ?? { hash: null, count: null };
}

type WebglSignal = { hash: string | null; vendor: string | null; renderer: string | null };

async function webglSignal(): Promise<WebglSignal> {
  const result = await safe(async () => {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;

    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = debug
      ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) ?? "")
      : String(gl.getParameter(gl.VENDOR) ?? "");
    const renderer = debug
      ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? "")
      : String(gl.getParameter(gl.RENDERER) ?? "");

    // Stable capability parameters only.
    const params: Array<number> = [
      gl.MAX_TEXTURE_SIZE,
      gl.MAX_RENDERBUFFER_SIZE,
      gl.MAX_VERTEX_ATTRIBS,
      gl.MAX_VARYING_VECTORS,
      gl.MAX_VERTEX_UNIFORM_VECTORS,
      gl.MAX_FRAGMENT_UNIFORM_VECTORS,
      gl.MAX_TEXTURE_IMAGE_UNITS,
      gl.MAX_CUBE_MAP_TEXTURE_SIZE,
      gl.ALIASED_LINE_WIDTH_RANGE,
      gl.ALIASED_POINT_SIZE_RANGE,
      gl.MAX_VIEWPORT_DIMS,
    ];
    const parts = params.map((p) => {
      const value = gl.getParameter(p);
      return Array.isArray(value) || ArrayBuffer.isView(value)
        ? Array.from(value as ArrayLike<number>).join(",")
        : String(value);
    });
    const extensions = (gl.getSupportedExtensions() ?? []).slice().sort().join(",");
    const hash = await sha256(
      [vendor, renderer, parts.join("|"), extensions, String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) ?? "")].join("~"),
    );
    return { hash, vendor: vendor || null, renderer: renderer || null };
  });
  return result ?? { hash: null, vendor: null, renderer: null };
}

async function audioHash(): Promise<string | null> {
  return safe(async () => {
    const Ctx =
      (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext })
        .OfflineAudioContext ??
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (!Ctx) return null;

    const ctx = new Ctx(1, 5000, 44100);
    const oscillator = ctx.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.value = 10000;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    oscillator.connect(compressor);
    compressor.connect(ctx.destination);
    oscillator.start(0);

    const buffer = await ctx.startRendering();
    const channel = buffer.getChannelData(0);
    let sum = 0;
    for (let i = 2500; i < channel.length; i += 1) sum += Math.abs(channel[i] ?? 0);
    // A deterministic scalar summary only — no audio is retained.
    return await sha256(sum.toFixed(8));
  });
}

type ClientHints = {
  platform: string | null;
  mobile: boolean | null;
  brands: unknown[] | null;
  highEntropy: Record<string, unknown> | null;
};

async function clientHints(): Promise<ClientHints> {
  const result = await safe(async () => {
    const uaData = (navigator as unknown as { userAgentData?: any }).userAgentData;
    if (!uaData) return null;
    let highEntropy: Record<string, unknown> | null = null;
    try {
      highEntropy = await uaData.getHighEntropyValues([
        "architecture",
        "bitness",
        "model",
        "platformVersion",
        "uaFullVersion",
        "fullVersionList",
      ]);
    } catch {
      highEntropy = null;
    }
    return {
      platform: typeof uaData.platform === "string" ? uaData.platform : null,
      mobile: typeof uaData.mobile === "boolean" ? uaData.mobile : null,
      brands: Array.isArray(uaData.brands) ? uaData.brands : null,
      highEntropy,
    };
  });
  return result ?? { platform: null, mobile: null, brands: null, highEntropy: null };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

export async function collectFingerprint(consentMode: ConsentMode): Promise<FingerprintPayload> {
  const [canvas, fonts, webgl, audio, hints] = await Promise.all([
    canvasHash(),
    fontSignal(),
    webglSignal(),
    audioHash(),
    clientHints(),
  ]);

  const nav = navigator as unknown as {
    hardwareConcurrency?: number;
    deviceMemory?: number;
    platform?: string;
    maxTouchPoints?: number;
    language?: string;
    languages?: readonly string[];
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
    };
  };

  const connection = nav.connection ?? {};
  const timezone = await safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone ?? null);

  const payload: Omit<FingerprintPayload, "fingerprint_hash"> = {
    visitor_id: getVisitorId(),
    session_id: getSessionId(),
    consent_mode: consentMode,
    fingerprint_version: FINGERPRINT_VERSION,
    canvas_hash: canvas,
    font_hash: fonts.hash,
    font_count: fonts.count,
    webgl_hash: webgl.hash,
    webgl_vendor: webgl.vendor,
    webgl_renderer: webgl.renderer,
    audio_hash: audio,
    hardware_concurrency: numberOrNull(nav.hardwareConcurrency),
    device_memory: numberOrNull(nav.deviceMemory),
    screen_width: numberOrNull(window.screen?.width),
    screen_height: numberOrNull(window.screen?.height),
    pixel_ratio: numberOrNull(window.devicePixelRatio),
    color_depth: numberOrNull(window.screen?.colorDepth),
    timezone: timezone ?? null,
    timezone_offset: numberOrNull(new Date().getTimezoneOffset()),
    language: typeof nav.language === "string" ? nav.language : null,
    languages: Array.isArray(nav.languages) ? [...nav.languages].slice(0, 12) : null,
    platform: typeof nav.platform === "string" ? nav.platform : null,
    max_touch_points: numberOrNull(nav.maxTouchPoints),
    connection_effective_type:
      typeof connection.effectiveType === "string" ? connection.effectiveType : null,
    connection_downlink: numberOrNull(connection.downlink),
    connection_rtt: numberOrNull(connection.rtt),
    connection_save_data: typeof connection.saveData === "boolean" ? connection.saveData : null,
    ua_ch_platform: hints.platform,
    ua_ch_mobile: hints.mobile,
    ua_ch_brands: hints.brands,
    ua_high_entropy: hints.highEntropy,
  };

  // Versioned, deterministic normalized subset. Keep this ordering stable —
  // changing it means bumping FINGERPRINT_VERSION.
  const canonical = [
    FINGERPRINT_VERSION,
    payload.canvas_hash ?? "",
    payload.font_hash ?? "",
    String(payload.font_count ?? ""),
    payload.webgl_hash ?? "",
    payload.webgl_vendor ?? "",
    payload.webgl_renderer ?? "",
    payload.audio_hash ?? "",
    String(payload.hardware_concurrency ?? ""),
    String(payload.device_memory ?? ""),
    `${payload.screen_width ?? ""}x${payload.screen_height ?? ""}`,
    String(payload.pixel_ratio ?? ""),
    String(payload.color_depth ?? ""),
    payload.timezone ?? "",
    String(payload.timezone_offset ?? ""),
    (payload.languages ?? []).join(","),
    payload.platform ?? "",
    String(payload.max_touch_points ?? ""),
    payload.ua_ch_platform ?? "",
    String(payload.ua_ch_mobile ?? ""),
  ].join("|");

  return { ...payload, fingerprint_hash: await sha256(canonical) };
}

// ---------------------------------------------------------------------------
// Submission — at most once per session, never on admin routes
// ---------------------------------------------------------------------------

function alreadySentThisSession(sessionId: string): boolean {
  try {
    return localStorage.getItem(SENT_SESSION_KEY) === sessionId;
  } catch {
    return false;
  }
}

function markSent(sessionId: string): void {
  try {
    localStorage.setItem(SENT_SESSION_KEY, sessionId);
  } catch {
    /* ignore */
  }
}

export async function captureAndSendFingerprint(consentMode: ConsentMode): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    if (isAdminPath(window.location.pathname)) return;

    const sessionId = getSessionId();
    if (!sessionId || alreadySentThisSession(sessionId)) return;
    markSent(sessionId);

    const payload = await collectFingerprint(consentMode);
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* enhanced analytics must never break the page */
  }
}
