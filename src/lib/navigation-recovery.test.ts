import { describe, expect, it, vi } from "vitest";
import { claimHardReload, isStaleBuildError, navigationPhase, NavigationTimeoutError, withNavigationTimeout } from "./navigation-recovery";

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe("navigation recovery", () => {
  it("recognises missing route files from an older release", () => {
    expect(isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: /assets/view.$id-abc.js"))).toBe(true);
    expect(isStaleBuildError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleBuildError(new Error("Network timeout"))).toBe(false);
  });

  it("allows only one automatic reload per URL within 30 seconds", () => {
    const storage = memoryStorage();
    expect(claimHardReload("/view/1", storage, 1_000)).toBe(true);
    expect(claimHardReload("/view/1", storage, 20_000)).toBe(false);
    expect(claimHardReload("/view/1", storage, 32_000)).toBe(true);
    expect(claimHardReload("/view/2", storage, 32_500)).toBe(true);
  });

  it("turns a stalled loader into an error after the limit", async () => {
    vi.useFakeTimers();
    const pending = withNavigationTimeout(new Promise(() => {}), 20_000, "The archive");
    const assertion = expect(pending).rejects.toBeInstanceOf(NavigationTimeoutError);
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    vi.useRealTimers();
  });

  it("passes through a loader that answers in time", async () => {
    await expect(withNavigationTimeout(Promise.resolve(42), 20_000, "x")).resolves.toBe(42);
  });

  it("shows loading feedback quickly and a reload option after 10 seconds", () => {
    expect(navigationPhase(false, 50_000)).toBe("idle");
    expect(navigationPhase(true, 100)).toBe("idle");
    expect(navigationPhase(true, 200)).toBe("loading");
    expect(navigationPhase(true, 10_000)).toBe("slow");
  });
});
