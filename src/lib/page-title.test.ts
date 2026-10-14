import { describe, expect, it } from "vitest";
import { fitPageTitle } from "./page-title";

describe("page title identity", () => {
  it("retains parsha names in long document titles", () => {
    const ber = fitPageTitle("Bereishis: Parsha Questions & Answers");
    const noa = fitPageTitle("Noach: Parsha Questions & Answers");
    expect(ber).toContain("Bereishis");
    expect(noa).toContain("Noach");
    expect(ber).not.toBe(noa);
    expect(ber.length).toBeLessThanOrEqual(60);
  });

  it("keeps site attribution for short titles", () => {
    expect(fitPageTitle("Parshas Noach")).toBe("Parshas Noach | Torah For The Table");
  });

  it("does not sacrifice a distinctive topic just to preserve the brand", () => {
    const title = fitPageTitle("Noach: A Very Long Collection of Questions and Insights");
    expect(title.startsWith("Noach:")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(60);
  });
});
