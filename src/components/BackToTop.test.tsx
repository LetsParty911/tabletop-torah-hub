import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BackToTop } from "./BackToTop";

function setScreen(mobile: boolean, reducedMotion = false) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: query.includes("max-width") ? mobile : query.includes("prefers-reduced-motion") ? reducedMotion : false,
  })));
}

function renderReturnButton(withList = true) {
  render(
    <>
      <div id="this-weeks-collection" />
      {withList && <div id="weekly-publication-list" />}
      <BackToTop collectionId="this-weeks-collection" />
    </>,
  );
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("mobile return to weekly selections", () => {
  it("returns directly to the PDF grid rather than the homepage top on mobile", () => {
    setScreen(true);
    const topScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderReturnButton();
    const list = document.getElementById("weekly-publication-list")!;
    const toList = vi.fn();
    list.scrollIntoView = toList;

    fireEvent.click(screen.getByRole("button"));
    expect(toList).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(topScroll).not.toHaveBeenCalled();
  });

  it("uses the collection anchor when there is no PDF grid", () => {
    setScreen(true);
    renderReturnButton(false);
    const collection = document.getElementById("this-weeks-collection")!;
    const toCollection = vi.fn();
    collection.scrollIntoView = toCollection;

    fireEvent.click(screen.getByRole("button"));
    expect(toCollection).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("preserves existing back-to-top behavior on desktop", () => {
    setScreen(false);
    const topScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderReturnButton();

    fireEvent.click(screen.getByRole("button"));
    expect(topScroll).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("respects reduced-motion preference on mobile", () => {
    setScreen(true, true);
    renderReturnButton();
    const list = document.getElementById("weekly-publication-list")!;
    const toList = vi.fn();
    list.scrollIntoView = toList;

    fireEvent.click(screen.getByRole("button"));
    expect(toList).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });
});
