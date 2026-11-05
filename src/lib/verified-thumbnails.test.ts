import { describe, expect, it } from "vitest";
import { derivativePath, verifiedThumbnailPaths, verifiedSmallThumbnailUrl } from "./verified-thumbnails";
const id = "8c7e8593-cebf-4bf4-b53c-ad41691cd3c9";
const old = "a".repeat(32), current = "b".repeat(32);
const original = (version: string) => ({ name: `${id}.png`, metadata: { eTag: `"${version}"` } });
const small = (version: string, size = 8000) => ({ name: derivativePath(id, version), metadata: { size, mimetype: "image/webp" } });
describe("authoritative thumbnail inventory", () => {
  it("never activates absent or legacy speculative files", () => {
    expect(verifiedThumbnailPaths([original(old)]).size).toBe(0);
  });
  it("activates only a confirmed matching original version within 24 KiB", () => {
    expect(verifiedThumbnailPaths([original(old), small(old)]).get(id)).toBe(derivativePath(id, old));
    expect(verifiedThumbnailPaths([original(old), small(old, 24577)]).size).toBe(0);
  });
  it("invalidates old artwork immediately on replacement and activates its immutable new URL", () => {
    expect(verifiedThumbnailPaths([original(current), small(old)]).size).toBe(0);
    expect(verifiedThumbnailPaths([original(current), small(old), small(current)]).get(id)).toBe(derivativePath(id, current));
  });
});
describe("optimized archive thumbnail URLs", () => {
  const source = `https://project.supabase.co/storage/v1/object/public/pdf-thumbs/${id}.png`;
  const available = new Map([[id, derivativePath(id, current)]]);
  it("reuses only verified immutable files for the same publication", () => {
    expect(verifiedSmallThumbnailUrl(source, id, available))
      .toBe(source.replace(`${id}.png`, derivativePath(id, current)));
  });
  it("preserves original-only display when a derivative is absent or publication differs", () => {
    expect(verifiedSmallThumbnailUrl(source, id, new Map())).toBeNull();
    expect(verifiedSmallThumbnailUrl(source.replace(id, "11111111-1111-4111-8111-111111111111"), id, available)).toBeNull();
    expect(verifiedSmallThumbnailUrl("/publication-covers/torah-wellsprings-plaque-v2.jpg", id, available)).toBeNull();
  });
  it("rejects malformed or untrusted storage paths", () => {
    expect(verifiedSmallThumbnailUrl(source, id, new Map([[id, `another.${current}.small.webp`]]))).toBeNull();
    expect(verifiedSmallThumbnailUrl(source.replace("https:", "http:"), id, available)).toBeNull();
    expect(verifiedSmallThumbnailUrl(source + "?format=png", id, available)).toBeNull();
  });
});
