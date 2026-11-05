import { afterEach, describe, expect, it, vi } from "vitest";
import { clearTfttCaches } from "./pwa-register";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("emergency PWA cache reset", () => {
  it("deletes only Torah for the Table cache buckets", async () => {
    const deleted: string[] = [];
    const caches = {
      keys: vi.fn(async () => [
        "tftt-shell-old",
        "unrelated-site-cache",
        "tftt-static-old",
        "tftt-data-old",
      ]),
      delete: vi.fn(async (name: string) => {
        deleted.push(name);
        return true;
      }),
    };
    Object.defineProperty(window, "caches", {
      configurable: true,
      value: caches,
    });

    await clearTfttCaches();

    expect(caches.keys).toHaveBeenCalledOnce();
    expect(deleted.sort()).toEqual([
      "tftt-data-old",
      "tftt-shell-old",
      "tftt-static-old",
    ]);
  });

  it("does not throw when the cache store is unavailable", async () => {
    Object.defineProperty(window, "caches", {
      configurable: true,
      value: {
        keys: vi.fn(async () => { throw new Error("blocked"); }),
      },
    });
    await expect(clearTfttCaches()).resolves.toBeUndefined();
  });
});
