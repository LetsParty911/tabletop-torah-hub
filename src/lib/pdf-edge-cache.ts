import { absoluteUrl } from "@/lib/site-url";

// Cloudflare's per-zone Cache API. Only present in the deployed Worker
// runtime - undefined during local dev / non-Cloudflare builds, so every
// caller must treat it as optional.
function getEdgeCache(): { match: Function; put: Function; delete: Function } | undefined {
  return (globalThis as any).caches?.default;
}

export function pdfDownloadUrl(id: string): string {
  return absoluteUrl(`/view/${id}/download`);
}

export function pdfViewUrl(id: string): string {
  return absoluteUrl(`/view/${id}/pdf`);
}

/**
 * Purge the edge-cached download/view responses for a PDF after the admin
 * replaces the file, unpublishes it, or deletes it. Cheap and safe to call
 * even when nothing was ever cached, and a no-op outside the Cloudflare
 * Worker runtime (local dev).
 *
 * IMPORTANT: this only clears the Cache API instance of the datacenter that
 * handled this admin request. Cloudflare's cache is per-datacenter and there
 * is no global purge available from inside the Worker, so other regions keep
 * their copy until its `s-maxage` expires. That lifetime (see
 * view.$id.download.tsx) is therefore what actually bounds staleness - keep
 * it short enough that a wrong or pulled file cannot circulate for long.
 */

export async function purgePdfEdgeCache(id: string): Promise<void> {
  const cache = getEdgeCache();
  if (!cache) return;
  try {
    await Promise.all([
      cache.delete(pdfDownloadUrl(id)),
      cache.delete(pdfViewUrl(id)),
    ]);
  } catch {
    // Best-effort - a failed purge just means the edge falls back to its
    // normal max-age/stale-while-revalidate expiry instead of an instant one.
  }
}

/**
 * Warms the edge cache for a just-published/replaced PDF by requesting its
 * own download URL once, server-side, right after publishing. Cloudflare's
 * cache is shared per-datacenter (not per-visitor), so this one request
 * means the *first real reader* in each region gets a warm hit instead of
 * paying the cold lookup+storage-read cost themselves. Call after
 * purgePdfEdgeCache (so any old cached entry for this URL is cleared first)
 * whenever a row's published state or file changes.
 *
 * Fire-and-forget: never blocks or fails the publish/replace action itself.
 * A failed warm just means the first reader pays the normal cold-path cost,
 * exactly like before this existed.
 */
export function warmPdfEdgeCache(id: string): void {
  try {
    fetch(pdfDownloadUrl(id)).catch(() => {
      // Best-effort - see comment above.
    });
  } catch {
    // Synchronous throw (e.g. fetch unavailable in this runtime) - ignore.
  }
}
