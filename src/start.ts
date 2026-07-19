import { createStart, createMiddleware } from "@tanstack/react-start";

/**
 * Cache-Control header policy for the HTML entry point and static assets.
 *
 * - HTML documents must always be revalidated so that new deploys are picked up
 *   immediately (hashed JS/CSS references in the shell change every build).
 * - Hashed files under /assets/ are content-addressed and safe to cache
 *   aggressively (immutable, 1 year).
 *
 * HTML <meta http-equiv="Cache-Control"> is unreliable and ignored by most
 * browsers / CDNs, so we set real HTTP response headers here on the Worker.
 */
const cacheControl = createMiddleware().server(async ({ next, request }) => {
  const result = await next();
  const response = (result as { response?: Response }).response;
  if (!response || !(response instanceof Response)) return result;

  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const contentType = response.headers.get("content-type") || "";

    // Long-lived immutable cache for hashed static assets.
    if (path.startsWith("/assets/")) {
      response.headers.set(
        "Cache-Control",
        "public, max-age=31536000, immutable",
      );
      return result;
    }

    // Always revalidate HTML documents (the SSR shell).
    if (contentType.includes("text/html")) {
      response.headers.set("Cache-Control", "no-cache, must-revalidate");
      // Belt-and-suspenders for legacy caches.
      response.headers.set("Pragma", "no-cache");
      response.headers.set("Expires", "0");
    }
  } catch {
    /* header mutation is best-effort; never break the response */
  }

  return result;
});

export const startInstance = createStart(() => ({
  requestMiddleware: [cacheControl],
}));
