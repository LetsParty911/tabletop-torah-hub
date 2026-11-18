import { describe, expect, it } from "vitest";
import { pdfActionLabel } from "./pdf-action-label";
import { mergeLabelCounts } from "./label-counts";
import { audienceLabel, normalizeAudience } from "./audience";

describe("PDF action accessible names", () => {
  it("names the PDF, its parsha and year so repeated weekly titles stay distinct", () => {
    expect(pdfActionLabel("open", "Parsha Questions & Answers", "Toldos", 5787))
      .toBe("Open PDF in a new tab: Parsha Questions & Answers, Parshas Toldos 5787");
    expect(pdfActionLabel("open", "Parsha Questions & Answers", "Noach", 5787))
      .not.toBe(pdfActionLabel("open", "Parsha Questions & Answers", "Toldos", 5787));
    expect(pdfActionLabel("download", "Torah Tavlin", "Vayetzei", null)).toBe("Download PDF: Torah Tavlin, Parshas Vayetzei");
  });

  it("does not repeat a reading already in the title, and keeps the plain form without context", () => {
    expect(pdfActionLabel("open", "Toldos: Two Brothers", "Toldos", 5787)).toBe("Open PDF in a new tab: Toldos: Two Brothers, 5787");
    expect(pdfActionLabel("open", "Zera Shimshon")).toBe("Open PDF in a new tab: Zera Shimshon");
  });
});

describe("public audience and type count labels", () => {
  it("shows Deeper Learning instead of Adults and merges counts that share a label", () => {
    const merged = mergeLabelCounts({ Adults: 16, Adult: 2, Families: 5, Children: 3 }, (raw) => audienceLabel(normalizeAudience(raw)) ?? raw);
    expect(merged).toEqual({ "Deeper Learning": 18, Families: 5, Children: 3 });
  });
});
