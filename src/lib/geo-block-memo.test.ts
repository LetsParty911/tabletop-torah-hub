import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoizedLookup, memoClear, memoGet, inflightCount, blockedCountries, TIMEOUT_RETRY_MS } from "./geo-block-memo";
import { matchBlockedCity, BLOCKED_CITIES } from "./geo-block.server";

type G = { city: string | null; region: string | null; country: string | null };
const ashburn: G = { city: "Ashburn", region: "Virginia", country: "US" };

beforeEach(() => { memoClear(); vi.useRealTimers(); });

describe("blocking lookup memo / single-flight", () => {
  it("repeated requests from one IP call providers once", async () => {
    const fn = vi.fn(async () => ashburn);
    for (let i = 0; i < 5; i++) expect(await memoizedLookup("1.1.1.1", fn)).toEqual(ashburn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("concurrent requests share one in-flight lookup", async () => {
    let release!: (v: G) => void;
    const fn = vi.fn(() => new Promise<G>((r) => (release = r)));
    const all = Promise.all([1, 2, 3, 4].map(() => memoizedLookup("2.2.2.2", fn, 5000)));
    expect(inflightCount()).toBe(1);
    release(ashburn);
    expect(await all).toEqual([ashburn, ashburn, ashburn, ashburn]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(inflightCount()).toBe(0);
  });
  it("slow lookup fails open within budget, then late result is reused (no second provider call)", async () => {
    let release!: (v: G) => void;
    const fn = vi.fn(() => new Promise<G>((r) => (release = r)));
    expect(await memoizedLookup("3.3.3.3", fn, 10)).toBeNull(); // fail open
    expect(await memoizedLookup("3.3.3.3", fn, 10)).toBeNull(); // short retry window, no new call
    release(ashburn);
    await new Promise((r) => setTimeout(r, 0));
    expect(await memoizedLookup("3.3.3.3", fn, 10)).toEqual(ashburn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("errors fail open and are negatively cached", async () => {
    const fn = vi.fn(async () => { throw new Error("x"); });
    expect(await memoizedLookup("4.4.4.4", fn)).toBeNull();
    expect(await memoizedLookup("4.4.4.4", fn)).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("expired entries revalidate", async () => {
    const fn = vi.fn(async () => null);
    await memoizedLookup("5.5.5.5", fn);
    expect(memoGet("5.5.5.5", Date.now() + TIMEOUT_RETRY_MS * 10)).toBeUndefined();
    const ttlShort = vi.fn(async () => ashburn);
    await memoizedLookup("6.6.6.6", ttlShort, 1500, () => 1);
    await new Promise((r) => setTimeout(r, 5));
    await memoizedLookup("6.6.6.6", ttlShort, 1500, () => 1);
    expect(ttlShort).toHaveBeenCalledTimes(2);
  });
});

describe("blocking policy unchanged", () => {
  it("exact city+region+country blocks; unknown or partial does not", () => {
    expect(matchBlockedCity(ashburn)?.label).toBe("Ashburn, VA");
    expect(matchBlockedCity({ city: null, region: null, country: "US" })).toBeNull();
    expect(matchBlockedCity({ city: "Ashburn", region: "Ohio", country: "US" })).toBeNull();
    expect(BLOCKED_CITIES).toHaveLength(9);
  });
  it("edge-country fast path skips countries without blocked cities", () => {
    const set = blockedCountries(BLOCKED_CITIES);
    expect(set.has("us")).toBe(true);
    expect(set.has("gb")).toBe(true);
    expect(set.has("ca")).toBe(false);
  });
});
