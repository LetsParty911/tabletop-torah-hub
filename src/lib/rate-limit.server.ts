// Best-effort request rate limiting, backed by Cloudflare's native Rate
// Limiting bindings (see wrangler.jsonc -> ratelimits).
//
// Fails open (allows the request) if a binding isn't reachable for any
// reason - local dev, a future runtime change, anything - so a problem with
// this mechanism can never itself break a legitimate visitor's ability to
// subscribe, send a contact message, or have their view/download tracked.
// Its only job is to blunt automated bulk abuse; it is not a security
// boundary on its own.

type CloudflareRateLimiter = {
  limit: (opts: { key: string }) => Promise<{ success: boolean }>;
};

export type RateLimitBinding = "PUBLIC_FORM_RATE_LIMITER" | "TRACKING_RATE_LIMITER";

function getRateLimiter(request: Request | undefined, binding: RateLimitBinding): CloudflareRateLimiter | undefined {
  const env = (request as unknown as { runtime?: { cloudflare?: { env?: Record<string, unknown> } } } | undefined)
    ?.runtime?.cloudflare?.env;
  return env?.[binding] as CloudflareRateLimiter | undefined;
}

/**
 * Returns true if the request should be allowed, false if it should be
 * rejected as rate-limited. `scope` namespaces the limit per endpoint (so
 * heavy use of one form doesn't also block another), combined with the
 * caller's IP as the actual rate-limit key. `binding` selects which
 * Cloudflare rate limiter to check against - use PUBLIC_FORM_RATE_LIMITER
 * for one-off actions (subscribe, contact) and TRACKING_RATE_LIMITER for
 * frequent beacon-style calls (page views, downloads, searches) that a
 * normal visitor can legitimately trigger many times per minute while
 * browsing.
 */
export async function checkRateLimit(
  request: Request | undefined,
  scope: string,
  binding: RateLimitBinding = "PUBLIC_FORM_RATE_LIMITER",
): Promise<boolean> {
  const limiter = getRateLimiter(request, binding);
  if (!limiter) return true;
  const ip = request?.headers.get("cf-connecting-ip") ?? "unknown";
  try {
    const { success } = await limiter.limit({ key: `${scope}:${ip}` });
    return success;
  } catch {
    return true;
  }
}
