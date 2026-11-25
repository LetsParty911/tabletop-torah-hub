import { afterEach, describe, expect, it, vi } from "vitest";
import { clearVerifiedThumbnailCache, readVerifiedThumbnails, readThumbnailInventory } from "./verified-thumbnails.server";

afterEach(() => {
  clearVerifiedThumbnailCache();
  vi.restoreAllMocks();
});

function adminWithList(list: ReturnType<typeof vi.fn>) {
  return { storage: { from: () => ({ list }) } };
}

describe("per-isolate thumbnail inventory cache", () => {
  it("coalesces simultaneous page loads into one Storage listing", async () => {
    const list = vi.fn(async () => ({ data: [], error: null }));
    const admin = adminWithList(list);
    const [first, second] = await Promise.all([
      readVerifiedThumbnails(admin),
      readVerifiedThumbnails(admin),
    ]);
    expect(first.size).toBe(0);
    expect(second.size).toBe(0);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("avoids repeated listings inside the two-minute freshness window", async () => {
    const list = vi.fn(async () => ({ data: [], error: null }));
    const admin = adminWithList(list);
    await readVerifiedThumbnails(admin);
    await readVerifiedThumbnails(admin);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("backs off after a denied listing rather than hammering storage", async () => {
    const list = vi.fn(async () => ({
      data: null,
      error: { status: 402, message: "exceed_egress_quota" },
    }));
    const admin = adminWithList(list);
    await readVerifiedThumbnails(admin);
    await readVerifiedThumbnails(admin);
    expect(list).toHaveBeenCalledTimes(1);
  });
});

it("shares verified PNG existence and replacement version with the cover selector", async () => {
  const id = "d6fe8aa5-7d0f-474d-bf38-90ccd3f65ec9";
  const version = "a".repeat(32);
  const list = vi.fn(async () => ({ data: [{ name: id + ".png", metadata: { eTag: version } }], error: null }));
  const admin = adminWithList(list);
  const inventory = await readThumbnailInventory(admin);
  expect(inventory.originalIds?.has(id)).toBe(true);
  expect(inventory.originalVersions.get(id)).toBe(version);
  expect((await readVerifiedThumbnails(admin)).size).toBe(0);
  expect(list).toHaveBeenCalledTimes(1);
});
it("distinguishes a failed inventory from a successful empty inventory", async () => {
  const admin = adminWithList(vi.fn(async () => ({ data: null, error: { message: "denied" } })));
  expect((await readThumbnailInventory(admin)).originalIds).toBeNull();
});
