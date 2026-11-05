// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isWeeklyCollectionHash, scrollToWeeklyCollection } from "./weekly-navigation";
afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });
describe("weekly return navigation", () => {
  it("recognizes the existing home anchor only", () => {
    expect(isWeeklyCollectionHash("#this-weeks-collection")).toBe(true);
    expect(isWeeklyCollectionHash("this-weeks-collection")).toBe(true);
    expect(isWeeklyCollectionHash("share-with-a-friend")).toBe(false);
  });
  it("scrolls and focuses committed selections without changing history", () => {
    document.body.innerHTML = '<section id="this-weeks-collection" tabindex="-1"></section>';
    const element = document.getElementById("this-weeks-collection");
    if (!element) throw new Error("Missing fixture");
    element.scrollIntoView = vi.fn();
    const history = vi.spyOn(window.history, "replaceState");
    scrollToWeeklyCollection();
    expect(element.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(element);
    expect(history).not.toHaveBeenCalled();
  });
  it("does nothing safely when choices have not mounted", () => {
    expect(() => scrollToWeeklyCollection()).not.toThrow();
  });
});