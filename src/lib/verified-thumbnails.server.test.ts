import { afterEach, describe, expect, it, vi } from "vitest";
import { clearVerifiedThumbnailCache, readVerifiedThumbnails } from "./verified-thumbnails.server";

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
