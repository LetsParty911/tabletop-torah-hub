import { describe, expect, it } from "vitest";
import { derivativePath, verifiedThumbnailPaths } from "./verified-thumbnails";
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