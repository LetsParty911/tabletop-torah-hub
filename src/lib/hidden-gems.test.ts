import { describe, expect, it } from "vitest";
import { hiddenGemBySlug, hiddenGemEditions, homepageHiddenGem, type HomepageGemContext } from "./hidden-gems";

const chayeiSarah: HomepageGemContext = { normalizedCollectionKey: "chayei sarah", activeParshaKey: "Chayei Sarah", isFallback: false, isYomTov: false, readingDate: "2026-11-07" };
const toldos: HomepageGemContext = { normalizedCollectionKey: "toldos", activeParshaKey: "Toldos", isFallback: false, isYomTov: false, readingDate: "2026-11-14" };
const chayeiThursday = new Date("2026-11-05T19:43:00Z");
const toldosThursday = new Date("2026-11-12T20:20:00Z");

describe("Hidden Gems weekly eligibility", () => {
  it("shows the approved Chayei Sarah edition in its active week", () => {
    expect(homepageHiddenGem(chayeiSarah, chayeiThursday)?.slug).toBe("the-400-shekel-secret");
  });
  it("shows the approved Toldos edition in the same active-week slot", () => {
    expect(homepageHiddenGem(toldos, toldosThursday)?.slug).toBe("fire-and-straw-hidden-in-one-word");
  });
  it("hides fallback collections", () => {
    expect(homepageHiddenGem({ ...toldos, isFallback: true }, toldosThursday)).toBeUndefined();
  });
  it("hides Yom Tov", () => {
    expect(homepageHiddenGem({ ...toldos, isYomTov: true }, toldosThursday)).toBeUndefined();
  });
  it("rejects a displayed parsha that does not match the active parsha", () => {
    expect(homepageHiddenGem({ ...toldos, activeParshaKey: "Vayeitzei" }, toldosThursday)).toBeUndefined();
  });
  it("hides stale dates after the Eastern week ends", () => {
    expect(homepageHiddenGem(chayeiSarah, new Date("2026-11-08T05:00:00Z"))).toBeUndefined();
  });
  it("does not surface prematurely in the prior week", () => {
    expect(homepageHiddenGem(toldos, new Date("2026-11-07T12:00:00Z"))).toBeUndefined();
  });
  it("fails closed on unknown or invalid dates", () => {
    for (const readingDate of [null, "invalid", "2026-02-31"]) expect(homepageHiddenGem({ ...toldos, readingDate }, toldosThursday)).toBeUndefined();
  });
  it("retains Chayei Sarah in the archive and adds Toldos", () => {
    expect(hiddenGemEditions.map((gem) => gem.slug)).toEqual(["the-400-shekel-secret", "fire-and-straw-hidden-in-one-word"]);
    expect(hiddenGemBySlug("the-400-shekel-secret")?.parshaKey).toBe("chayei sarah");
    expect(hiddenGemBySlug("fire-and-straw-hidden-in-one-word")?.parshaKey).toBe("toldos");
  });
  it("uses the verified Toldos gematria", () => {
    const gem = hiddenGemBySlug("fire-and-straw-hidden-in-one-word");
    const values: Record<string, number> = { א: 1, ש: 300, ת: 400, ו: 6, ק: 100 };
    const gematria = (text: string) => Array.from(text).reduce((sum, letter) => sum + (values[letter] ?? 0), 0);
    expect(gem?.equations.map((eq) => [eq.hebrew, eq.value, gematria(eq.hebrew)])).toEqual([["אשתו", 707, 707], ["קש ואש", 707, 707]]);
  });
});