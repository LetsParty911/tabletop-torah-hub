import { verifiedThumbnailPaths, type ThumbnailObject } from "./verified-thumbnails";

/** One paginated inventory per collection read; failure means original-only.
 * No cross-request availability cache: replacements must invalidate immediately. */
export async function readVerifiedThumbnails(admin: any): Promise<Map<string, string>> {
  try {
    const objects: ThumbnailObject[] = [];
    for (let offset = 0; offset < 10000; offset += 1000) {
      const { data, error } = await admin.storage.from("pdf-thumbs").list("", {
        limit: 1000, offset, sortBy: { column: "name", order: "asc" },
      });
      if (error || !data) return new Map();
      objects.push(...data);
      if (data.length < 1000) return verifiedThumbnailPaths(objects);
    }
    return new Map(); // A truncated inventory must never imply availability.
  } catch {
    return new Map();
  }
}