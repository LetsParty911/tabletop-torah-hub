// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
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
describe("desktop and mobile publication discovery", () => {
  it("exposes Parshas and Publications in the desktop header", () => {
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    const desktopNav = root.split('<div className="hidden items-center gap-3 lg:flex xl:gap-4">')[1]?.split('<Button')[0] ?? "";
    expect(desktopNav).toContain('to="/divrei-torah-parsha"');
    expect(desktopNav).toContain('to="/publications"');
    expect(desktopNav).toContain("Our Originals");
  });
  it("keeps the full mobile menu and a consistent lg breakpoint", () => {
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    expect(root).toContain('text-primary lg:hidden');
    expect(root).toContain('pt-2 lg:hidden');
    expect(root).toContain('pt-3 lg:block');
    expect(root).toContain('<Link to="/hidden-gems" className={mobileLinkCls}>Hidden Gems</Link>');
    expect(root).toContain('<Link to="/about" className={mobileLinkCls}>About</Link>');
  });
});
