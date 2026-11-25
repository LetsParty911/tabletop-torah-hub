import { describe, expect, it } from "vitest";
import { BUILD_ID, claimReleaseReload, isCatalogRefreshPath, isPreviewHost } from "./site-freshness";
import { smallThumbnailUrl } from "./thumbnail-preview";

describe("safe site freshness", () => {
  it("only refreshes public catalogues, never PDF readers, accounts or admin", () => {
    for (const path of ["/", "/archive", "/originals", "/publications", "/publication/example", "/parsha/vayishlach/5787"])
      expect(isCatalogRefreshPath(path), path).toBe(true);
    for (const path of ["/admin", "/admin-analytics", "/admin/upload", "/view/123", "/view/123/pdf", "/view/123/download", "/my-table", "/manage-table/token", "/api/site-version", "/contact"])
      expect(isCatalogRefreshPath(path), path).toBe(false);
  });
  it("allows only one reload per target build and fails safely without storage", () => {
    const entries = new Map<string, string>();
    const storage = { getItem: (k: string) => entries.get(k) ?? null, setItem: (k: string, v: string) => { entries.set(k, v); } };
    expect(claimReleaseReload("release-new", storage)).toBe(true);
    expect(claimReleaseReload("release-new", storage)).toBe(false);
    expect(claimReleaseReload("release-next", storage)).toBe(true);
    expect(claimReleaseReload(BUILD_ID, storage)).toBe(false);
    expect(claimReleaseReload("release-new", null)).toBe(false);
    expect(claimReleaseReload("bad value", storage)).toBe(false);
  });
  it("excludes preview hosts", () => {
    expect(isPreviewHost("id-preview--abc.lovable.app")).toBe(true);
    expect(isPreviewHost("abc.lovableproject.com")).toBe(true);
    expect(isPreviewHost("torahforthetable.com")).toBe(false);
  });
  it("does not accept a small derivative from a stale version of a replaced PNG", () => {
    const base = "https://example.supabase.co/storage/v1/object/public/pdf-thumbs/8c7e8593-cebf-4bf4-b53c-ad41691cd3c9";
    const version = "a".repeat(32);
    const original = base + ".png?v=" + version;
    const current = base + "." + version + ".small.webp";
    expect(smallThumbnailUrl(original, current)).toBe(current);
    expect(smallThumbnailUrl(original, base + "." + "b".repeat(32) + ".small.webp")).toBeNull();
  });
});
