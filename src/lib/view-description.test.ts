import { expect, it } from "vitest";
import { viewDescription } from "./view-description";
it("identifies the authoritative parsha and year once", () => {
  expect(viewDescription("Parsha Questions & Answers", "Parsha Questions & Answers offers questions.", "Parshas Chayei Sarah", 5787)).toBe("Parsha Questions & Answers — Parshas Chayei Sarah 5787. Offers questions.");
});