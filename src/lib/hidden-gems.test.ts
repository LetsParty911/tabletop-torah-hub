import { describe, expect, it } from "vitest";
import { hiddenGemBySlug, hiddenGemEditions, homepageHiddenGem, type HomepageGemContext } from "./hidden-gems";
const context: HomepageGemContext = { normalizedCollectionKey: "chayei sarah", activeParshaKey: "Chayei Sarah", isFallback: false, isYomTov: false, readingDate: "2026-11-07" };
const thursday = new Date("2026-11-05T19:43:00Z");
describe("Hidden Gems weekly eligibility", () => {
  it("shows the approved Chayei Sarah edition in the active week", () => { expect(homepageHiddenGem(context, thursday)?.slug).toBe("the-400-shekel-secret"); });
  it("hides fallback collections", () => { expect(homepageHiddenGem({ ...context, isFallback: true }, thursday)).toBeUndefined(); });
  it("hides Yom Tov", () => { expect(homepageHiddenGem({ ...context, isYomTov: true }, thursday)).toBeUndefined(); });
  it("rejects stale displayed Chayei Sarah under a later active parsha", () => { expect(homepageHiddenGem({ ...context, activeParshaKey: "Toldos" }, thursday)).toBeUndefined(); });
  it("hides subsequent unapproved weeks", () => { expect(homepageHiddenGem({ ...context, normalizedCollectionKey: "toldos", activeParshaKey: "Toldos", readingDate: "2026-11-14" }, new Date("2026-11-12T12:00:00Z"))).toBeUndefined(); });
  it("hides stale dates after the Eastern week ends", () => { expect(homepageHiddenGem(context, new Date("2026-11-08T05:00:00Z"))).toBeUndefined(); });
  it("does not surface prematurely in the prior week", () => { expect(homepageHiddenGem(context, new Date("2026-10-31T12:00:00Z"))).toBeUndefined(); });
  it("fails closed on unknown or invalid dates", () => { for (const readingDate of [null, "invalid", "2026-02-31"]) expect(homepageHiddenGem({ ...context, readingDate }, thursday)).toBeUndefined(); });
  it("retains only the approved archive edition after rollover", () => {
    expect(hiddenGemEditions.map((gem) => gem.slug)).toEqual(["the-400-shekel-secret"]);
    expect(hiddenGemBySlug("the-400-shekel-secret")?.parshaKey).toBe("chayei sarah");
    expect(hiddenGemBySlug("future-entry")).toBeUndefined();
  });
  it("uses the verified Hebrew numerical equivalences and price", () => {
    const gem = hiddenGemBySlug("the-400-shekel-secret");
    const values: Record<string, number> = { ע: 70, פ: 80, ר: 200, ן: 50, י: 10 };
    const gematria = (text: string) => Array.from(text).reduce((sum, letter) => sum + (values[letter] ?? 0), 0);
    expect(gem?.equations.map((eq) => [eq.hebrew, eq.value, gematria(eq.hebrew)])).toEqual([["עפרן", 400, 400], ["עין רע", 400, 400]]);
    expect(gem?.price).toBe(400);
  });
});