import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PDF_REPORTING, pdfEventLabel, pdfReasonLabel } from "./pdf-reporting";

describe("truthful PDF report terminology", () => {
  it("distinguishes clicks, viewer loads, requests, redirects and print intent", () => {
    expect(pdfEventLabel("publication_click", { action: "open_pdf" })).toBe("Open PDF click (attempted open)");
    expect(pdfEventLabel("publication_click")).not.toBe("Open PDF click (attempted open)");
    expect(pdfEventLabel("pdf_open")).toBe("PDF viewer loads");
    expect(pdfEventLabel("download")).toBe("Download request/action");
    expect(pdfEventLabel("download_served")).toContain("not confirmed download");
    expect(pdfEventLabel("pdf_route_result", { http_status: 302 })).toBe("PDF redirect issued (not confirmed download)");
    expect(pdfEventLabel("pdf_route_result", { http_status: 404 })).toBe("PDF route failed");
    expect(pdfEventLabel("print_click")).toBe("Print click (not confirmed printing)");
  });

  it("translates the legacy Used Torah reason without changing its stored qualification", () => {
    expect(pdfReasonLabel("Opened a PDF")).toBe("PDF viewer loaded (automatic)");
    expect(pdfReasonLabel("Clicked Open PDF")).toBe("Clicked Open PDF");
    expect(PDF_REPORTING.usedTorahDefinition).toContain("qualification and priority are unchanged");
    expect(PDF_REPORTING.clickedDefinition).toContain("Missing IDs are excluded");
    expect(PDF_REPORTING.attemptedDefinition).toContain("No per-visitor limit");
  });

  it("owner and overview headings never overstate the unique click metric or viewer loads", () => {
    for (const file of ["OwnerSummary", "AdminAnalyticsReport"]) {
      const source = readFileSync(`src/components/admin/${file}.tsx`, "utf8");
      expect(source).toContain('label="Distinct PDFs clicked"');
      expect(source).toContain('label="PDF viewer loads"');
      expect(source).not.toContain('label="Unique PDFs opened"');
      expect(source).not.toContain('label="PDF viewer opens"');
      expect(source).toContain("PDF_REPORTING.usedTorahDefinition");
    }
  });

  it("exports and legacy journeys retain request/attempt wording", () => {
    expect(readFileSync("src/components/admin/CountedPdfOpens.tsx", "utf8")).toContain("counted_pdf_attempted_opens");
    expect(readFileSync("src/components/admin/OpenPdfClicksPanel.tsx", "utf8")).toContain('"transfer_confirmation"');
    expect(readFileSync("src/components/Phase2ReturningAnalytics.tsx", "utf8")).toContain("Download requested:");
    expect(readFileSync("src/components/TrafficSources.tsx", "utf8")).not.toContain("Sessions that downloaded");
  });
});