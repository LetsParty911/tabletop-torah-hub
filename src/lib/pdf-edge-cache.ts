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
 * Purge the edge-cached download/view responses for a PDF so a reader
 * never sees stale bytes (or a stale "published" response) after the
 * admin replaces the file, unpublishes it, or deletes it. Cheap and
 * safe to call even when nothing was ever cached, and a no-op outside
 * the Cloudflare Worker runtime (local dev).
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
