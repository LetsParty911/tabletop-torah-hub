/** Storage metadata is read in batches, never probed for individual images. */
export type ThumbnailObject = { name: string; metadata?: { eTag?: string; size?: number; mimetype?: string } | null };
export function thumbnailVersion(etag: string | undefined): string | null {
  const value = etag?.replaceAll('"', "").toLowerCase();
  return value && /^[a-f0-9]{32}$/.test(value) ? value : null;
}
export function derivativePath(id: string, version: string): string {
  return `${id}.${version}.small.webp`;
}
export function verifiedThumbnailPaths(objects: ThumbnailObject[]): Map<string, string> {
  const byName = new Map(objects.map(object => [object.name, object]));
  const result = new Map<string, string>();
  for (const object of objects) {
    const match = /^([a-f0-9-]{36})\.png$/.exec(object.name);
    const version = thumbnailVersion(object.metadata?.eTag);
    if (!match || !version) continue;
    const path = derivativePath(match[1], version);
    const small = byName.get(path)?.metadata;
    if (small?.mimetype === "image/webp" && typeof small.size === "number" && small.size > 0 && small.size <= 24576) result.set(match[1], path);
  }
  return result;
}