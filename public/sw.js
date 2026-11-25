/* Torah For The Table: fresh online documents and data; offline notice only.
 * Never cache API, auth, PDF, cross-origin storage, or mutable artwork in the
 * service worker. Cache only explicitly versioned static files. */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const SHELL_CACHE = `tftt-v2-shell-${VERSION}`;
const STATIC_CACHE = `tftt-v2-static-${VERSION}`;
const OFFLINE_URL = "/offline";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(c =>
    c.add(new Request(OFFLINE_URL, { cache: "reload" })).catch(() => undefined)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("tftt-") &&
      ![SHELL_CACHE, STATIC_CACHE].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
function bypass(url) {
  return url.origin !== self.location.origin ||
    /^\/(?:api|_serverFn)(?:\/|$)/.test(url.pathname) ||
    /\/(?:view)\/[^/]+\/(?:download|pdf)\/?$/i.test(url.pathname) ||
    /\.(?:pdf|mp3|m4a|wav|ogg)$/i.test(url.pathname);
}
function immutable(url) {
  return /^\/original-series-covers\/[^/]+\.[a-f0-9]{10}\.webp$/.test(url.pathname) ||
    /^\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.(?:js|mjs|css|woff2?)$/.test(url.pathname);
}
function staticAsset(url, request) {
  return ["image", "font", "script", "style"].includes(request.destination) ||
    /\.(?:css|js|mjs|woff2?|ttf|otf|png|jpe?g|gif|webp|svg|ico)$/i.test(url.pathname);
}
async function navigation(request) {
  try { return await fetch(request, { cache: "no-store" }); }
  catch {
    try {
      const offline = await (await caches.open(SHELL_CACHE)).match(OFFLINE_URL);
      if (offline) return offline;
    } catch { /* cache disabled */ }
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}
async function versionedAsset(request) {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch { return fetch(request); }
}
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!/^https?:$/.test(url.protocol) || bypass(url)) return;
  if (request.mode === "navigate") { event.respondWith(navigation(request)); return; }
  if (immutable(url)) { event.respondWith(versionedAsset(request)); return; }
  if (staticAsset(url, request)) event.respondWith(fetch(request, { cache: "no-cache" }));
});
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
