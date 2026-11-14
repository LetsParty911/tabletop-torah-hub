import { verifiedThumbnailPaths, type ThumbnailObject } from "./verified-thumbnails";

// The public catalogue is read on many independent page renders. A full
// Storage listing is expensive (hundreds of KB); share it briefly per isolate.
// Administrative uploads remain visible when this small TTL expires.
const SUCCESS_TTL_MS = 2 * 60 * 1000;
const FAILURE_TTL_MS = 20 * 1000;
let cached: { value: Map<string, string>; expiresAt: number } | null = null;
let pending: Promise<Map<string, string>> | null = null;

export function clearVerifiedThumbnailCache(): void {
  cached = null;
}

export async function readVerifiedThumbnails(admin: any): Promise<Map<string, string>> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (pending) return pending;

  pending = (async () => {
    let result = new Map<string, string>();
    let ttl = FAILURE_TTL_MS;
    try {
      const objects: ThumbnailObject[] = [];
      for (let offset = 0; offset < 10000; offset += 1000) {
        const { data, error } = await admin.storage.from("pdf-thumbs").list("", {
          limit: 1000, offset, sortBy: { column: "name", order: "asc" },
        });
        if (error || !data) break;
        objects.push(...data);
        if (data.length < 1000) {
          result = verifiedThumbnailPaths(objects);
          ttl = SUCCESS_TTL_MS;
          break;
        }
      }
    } catch {
      // Missing inventory is not fatal: use the original thumbnail URLs.
    } finally {
      cached = { value: result, expiresAt: Date.now() + ttl };
      pending = null;
    }
    return result;
  })();
  return pending;
}
