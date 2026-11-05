import { expect, it } from "vitest";
import { viewDescription } from "./view-description";
it("identifies the authoritative parsha and year once", () => {
  expect(viewDescription("Parsha Challenge", "Parsha Challenge offers questions.", "Parshas Chayei Sarah", 5787)).toBe("Parsha Challenge — Parshas Chayei Sarah 5787. offers questions.");
});