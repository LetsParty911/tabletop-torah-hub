/* Torah for the Table — service worker
 * Strategy:
 *  - App shell (navigations): network-first, fallback to cache, then /offline
 *  - Supabase API + dynamic data: network-first with cache fallback
 *  - Static assets (fonts, images, icons, JS/CSS): cache-first
 *  - PDFs and audio: bypass (do NOT cache)
 */
const VERSION = "v2";
const SHELL_CACHE = `tftt-shell-${VERSION}`;
const STATIC_CACHE = `tftt-static-${VERSION}`;
const DATA_CACHE = `tftt-data-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = ["/", OFFLINE_URL, "/manifest.webmanifest", "/favicon.png", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(PRECACHE_URLS).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("tftt-") && ![SHELL_CACHE, STATIC_CACHE, DATA_CACHE].includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isBypassed(url) {
  const p = url.pathname.toLowerCase();
  if (p.endsWith(".pdf") || p.endsWith(".mp3") || p.endsWith(".m4a") || p.endsWith(".wav") || p.endsWith(".ogg")) return true;
  // Supabase storage PDFs/audio
  if (url.hostname.includes("supabase.co") && p.includes("/storage/")) return true;
  return false;
}

function isDataRequest(url) {
  if (url.hostname.includes("supabase.co")) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/_serverFn/")) return true;
  return false;
}

function isStaticAsset(url, req) {
  const dest = req.destination;
  if (["style", "script", "font", "image"].includes(dest)) return true;
  if (/\.(css|js|mjs|woff2?|ttf|otf|png|jpe?g|gif|webp|svg|ico)$/i.test(url.pathname)) return true;
  return false;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok && req.method === "GET") cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function handleNavigation(req) {
  try {
    const res = await fetch(req);
    const cache = await caches.open(SHELL_CACHE);
    cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cached = (await cache.match(req)) || (await cache.match("/"));
    if (cached) return cached;
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (isBypassed(url)) return;

  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(req));
    return;
  }
  if (isDataRequest(url)) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }
  if (isStaticAsset(url, req)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
