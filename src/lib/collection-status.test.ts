import { describe, expect, it } from "vitest";
import { collectionCountLine, displayContentType, isCollectionComplete, pdfActionHrefs } from "./collection-status";
import { formatTypeLabel } from "./format-labels";

describe("collection status", () => {
  it("is complete only at 100% with live published items", () => {
    expect(isCollectionComplete(100, false, 23)).toBe(true);
    expect(isCollectionComplete(95, false, 23)).toBe(false);
    expect(isCollectionComplete(100, true, 23)).toBe(false);
    expect(isCollectionComplete(100, false, 0)).toBe(false);
    expect(isCollectionComplete(null, false, 23)).toBe(false);
  });
  it("never says more coming once complete", () => {
    const done = collectionCountLine(23, true);
    expect(done).toContain("All 23");
    expect(done).toContain("complete");
    expect(done).not.toMatch(/more coming/i);
    expect(collectionCountLine(5, false)).toMatch(/more coming/);
  });
});

describe("PDF actions", () => {
  it("use the existing open and download routes", () => {
    expect(pdfActionHrefs("a b")).toEqual({ open: "/view/a%20b/pdf", download: "/view/a%20b/download" });
  });
});

describe("Questions & Answers label", () => {
  it("wins over Short Vorts/Brief Insights format", () => {
    expect(displayContentType("Questions & Answers", "Short Vorts", formatTypeLabel)).toBe("Questions & Answers");
    expect(displayContentType("Brief Insights", "Short Vorts", formatTypeLabel)).toBe("Brief Insights");
    expect(displayContentType(null, "Stories", formatTypeLabel)).toBe("Stories");
  });
});
