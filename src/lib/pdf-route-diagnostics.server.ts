/**
 * Diagnostic only: records that the application issued a valid redirect (302)
 * or returned a status error for /view/$id/pdf. It NEVER proves the CDN
 * delivered bytes or that the PDF was read.
 *
 * Correlation parameters (a=action UUID, s=session, v=visitor) are accepted
 * only when v matches the first-party tftt_vid cookie; forged or incomplete
 * identifiers are discarded. No IP, raw user agent, or query string is stored.
 *
 * Root cause of the earlier zero-row result: this module used
 * `@vercel/functions` waitUntil, which is a silent no-op outside Vercel. On the
 * Cloudflare Worker runtime the floating write was cancelled once the 302 was
 * returned. We now hand the write to the real Worker waitUntil, and only if no
 * such hook exists do we wait a short, bounded time. Analytics failure never
 * changes or blocks the PDF response.
 */

const SAFE = /^[a-zA-Z0-9_-]{6,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FALLBACK_WAIT_MS = 250;

export type PdfRouteStatus = 302 | 404 | 500;

export interface PdfOutcomeRow {
  event_id: string;
  event_name: "pdf_route_result";
  occurred_at: string;
  visitor_id: string;
  session_id: string;
  is_new_visitor: false;
  is_internal: boolean;
  path: string;
  publication_id: string;
  metadata: { action_id: string; http_status: PdfRouteStatus; outcome: "redirect_issued" | "route_failed" };
}

export interface PdfOutcomeDeps {
  isAutomated: (ua: string) => boolean;
  isInternal: (request: Request) => Promise<boolean>;
  write: (row: PdfOutcomeRow) => Promise<void>;
  now: () => Date;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      try { return decodeURIComponent(rest.join("=")); } catch { return null; }
    }
  }
  return null;
}

/** Pure validation: returns correlation IDs only when trustworthy. */
export function readCorrelation(request: Request): { action: string; sid: string; vid: string } | null {
  let url: URL;
  try { url = new URL(request.url); } catch { return null; }
  const action = url.searchParams.get("a") ?? "";
  const sid = url.searchParams.get("s") ?? "";
  const vid = url.searchParams.get("v") ?? "";
  if (!UUID.test(action) || !SAFE.test(sid) || !SAFE.test(vid)) return null;
  const cookieVid = readCookie(request, "tftt_vid");
  if (!cookieVid || cookieVid !== vid) return null;
  return { action: action.toLowerCase(), sid, vid };
}

export function buildOutcomeRow(
  c: { action: string; sid: string; vid: string },
  publicationId: string,
  status: PdfRouteStatus,
  internal: boolean,
  now: Date,
): PdfOutcomeRow {
  return {
    event_id: "pdf-outcome-" + c.action,
    event_name: "pdf_route_result",
    occurred_at: now.toISOString(),
    visitor_id: c.vid,
    session_id: c.sid,
    is_new_visitor: false,
    is_internal: internal,
    path: "/view/" + publicationId + "/pdf",
    publication_id: publicationId,
    metadata: {
      action_id: c.action,
      http_status: status,
      outcome: status === 302 ? "redirect_issued" : "route_failed",
    },
  };
}

/** The write itself. Never throws. Returns whether a row was written. */
export async function writePdfOutcome(
  request: Request,
  publicationId: string,
  status: PdfRouteStatus,
  deps: PdfOutcomeDeps,
): Promise<boolean> {
  try {
    const c = readCorrelation(request);
    if (!c) return false;
    if (deps.isAutomated(request.headers.get("user-agent") ?? "")) return false;
    const internal = await deps.isInternal(request).catch(() => false);
    await deps.write(buildOutcomeRow(c, publicationId, status, internal, deps.now()));
    return true;
  } catch (e) {
    console.error("[pdf-route-diagnostics] write failed", e instanceof Error ? e.message : "unknown");
    return false;
  }
}

type WaitUntilFn = (p: Promise<unknown>) => void;

/** Locate a real background hook: request-attached Worker ctx, then cloudflare:workers. */
export async function resolveWaitUntil(request: Request): Promise<WaitUntilFn | null> {
  const ctx = (request as unknown as { runtime?: { cloudflare?: { context?: { waitUntil?: WaitUntilFn } } } })
    .runtime?.cloudflare?.context;
  if (typeof ctx?.waitUntil === "function") return (p) => ctx.waitUntil!(p);
  try {
    const mod = "cloudflare:workers";
    const cf = (await import(/* @vite-ignore */ mod)) as { waitUntil?: WaitUntilFn };
    if (typeof cf.waitUntil === "function") return (p) => cf.waitUntil!(p);
  } catch { /* not running on workerd */ }
  return null;
}

/** Schedule work so it survives the response; otherwise wait at most `maxWaitMs`. */
export async function runInBackground(
  task: Promise<unknown>,
  waitUntil: WaitUntilFn | null,
  maxWaitMs = FALLBACK_WAIT_MS,
): Promise<"scheduled" | "bounded"> {
  const safe = task.catch(() => undefined);
  if (waitUntil) {
    try { waitUntil(safe); return "scheduled"; } catch { /* fall through */ }
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([safe, new Promise((r) => { timer = setTimeout(r, maxWaitMs); })]);
  if (timer) clearTimeout(timer);
  return "bounded";
}

async function defaultDeps(): Promise<PdfOutcomeDeps> {
  const [{ isAutomatedAgent }, { isInternalRequest }, { getSupabaseAdmin }] = await Promise.all([
    import("@/lib/request-telemetry.server"),
    import("@/lib/internal-marker.server"),
    import("@/integrations/supabase/ext.server"),
  ]);
  return {
    isAutomated: isAutomatedAgent,
    isInternal: isInternalRequest,
    now: () => new Date(),
    write: async (row) => {
      const { error } = await getSupabaseAdmin()
        .from("analytics_events")
        .upsert(row, { onConflict: "event_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },
  };
}

/**
 * Called by the PDF route before returning. Cheap pre-check first so requests
 * without valid correlation never touch the runtime or database. Never throws.
 */
export async function recordPdfRouteOutcome(
  request: Request,
  publicationId: string,
  status: PdfRouteStatus,
  depsOverride?: PdfOutcomeDeps,
  waitUntilOverride?: WaitUntilFn | null,
): Promise<void> {
  try {
    if (!readCorrelation(request)) return;
    const task = (async () => writePdfOutcome(request, publicationId, status, depsOverride ?? (await defaultDeps())))();
    const wu = waitUntilOverride !== undefined ? waitUntilOverride : await resolveWaitUntil(request);
    await runInBackground(task, wu);
  } catch { /* never interfere with file delivery */ }
}
