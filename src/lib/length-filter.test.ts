import { describe, expect, it } from "vitest";
import { matchesPageLength } from "./length-filter";
import { normalizeAudience } from "./audience";

describe("page length subsets", () => {
  it("short is strictly under five", () => {
    expect([4, 5, 19, 20].filter((n) => matchesPageLength(n, "short"))).toEqual([4]);
  });
  it("medium includes five through nineteen, not twenty", () => {
    expect([4, 5, 19, 20].filter((n) => matchesPageLength(n, "medium"))).toEqual([5, 19]);
  });
  it("study starts at twenty", () => {
    expect([4, 5, 19, 20, 40].filter((n) => matchesPageLength(n, "study"))).toEqual([20, 40]);
  });
  it("legacy long still includes all five-plus items", () => {
    expect([4, 5, 19, 20].filter((n) => matchesPageLength(n, "long"))).toEqual([5, 19, 20]);
  });
  it("unknown length is only in All", () => {
    expect(matchesPageLength(null, "All")).toBe(true);
    expect(matchesPageLength(null, "medium")).toBe(false);
  });
  it("unspecified ordinary audience stays unspecified", () => {
    expect(normalizeAudience(null, "Torah Wellsprings")).toBeNull();
  });
});