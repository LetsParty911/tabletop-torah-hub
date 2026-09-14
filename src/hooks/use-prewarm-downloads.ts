import { useEffect } from "react";

/**
 * Intentionally disabled.
 *
 * The previous implementation fetched PDF download endpoints in the
 * background to warm an edge cache. That consumed the same PDF bandwidth
 * before the visitor asked for the file and could compete with the real
 * download, especially on mobile/cellular connections.
 *
 * Downloads now redirect to the public Supabase Storage CDN, so speculative
 * whole-file prefetching is unnecessary. Keep this hook as a no-op so callers
 * do not need to change and future code does not accidentally reintroduce
 * background PDF transfers.
 */
export function usePrewarmDownloads(ids: readonly string[]) {
  // Preserve a stable dependency and a valid hook call without network work.
  const key = ids.join(",");

  useEffect(() => {
    void key;
  }, [key]);
}
