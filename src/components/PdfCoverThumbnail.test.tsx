import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const record = vi.hoisted(() => vi.fn());
vi.mock("./DownloadToPrintButton", () => ({ recordPdfAction: record }));
import { PdfCoverThumbnail } from "./PdfCoverThumbnail";
import { ORIGINAL_PROMOTION_SERIES } from "@/lib/originals-promotion";
afterEach(() => { cleanup(); record.mockClear(); });
describe("optimized covers preserve deliberate PDF actions", () => {
  it("never tracks loading; one click retains open_pdf, PDF ID and thumbnail entry point", () => {
    const id = "8c7e8593-cebf-4bf4-b53c-ad41691cd3c9";
    const src = `https://example.test/storage/v1/object/public/pdf-thumbs/${id}.png`;
    render(<PdfCoverThumbnail pdfId={id} title="Test publication" thumbnailUrl={src} smallThumbnailUrl={src.replace(".png", `.${"a".repeat(32)}.small.webp`)} />);
    expect(record).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link"));
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][1]).toBe("open_pdf");
    expect(record.mock.calls[0][2]).toBe(`/view/${id}/pdf`);
    expect(record.mock.calls[0][3].publicationId).toBe(id);
    expect(record.mock.calls[0][4]).toBe("thumbnail");
  });
});
describe("permanent original listing covers", () => {
  it.each(ORIGINAL_PROMOTION_SERIES)("uses the branded cover even without an issue preview: $title", (series) => {
    render(<PdfCoverThumbnail pdfId="weekly-issue" seriesPublicationId={series.publicationId} title={series.title} />);
    const img = screen.getByRole("img", { name: series.title + " permanent cover" });
    expect(img.getAttribute("src")).toBe(series.coverSrc);
    expect(img.getAttribute("width")).toBe("64");
    expect(img.getAttribute("height")).toBe("80");
    expect(record).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link"));
    expect(record.mock.calls[0][2]).toBe("/view/weekly-issue/pdf");
    expect(record.mock.calls[0][3].publicationId).toBe("weekly-issue");
  });
  it("uses the actual issue image in historical archives", () => {
    const series = ORIGINAL_PROMOTION_SERIES[0];
    render(<PdfCoverThumbnail pdfId="old-issue" seriesPublicationId={series.publicationId} coverContext="archive" title={series.title} thumbnailUrl="/actual-first-page.png" />);
    expect(screen.getByRole("img", { name: "First page of " + series.title }).getAttribute("src")).toBe("/actual-first-page.png");
  });
  it("does not borrow branded artwork from a matching title without canonical ownership", () => {
    const series = ORIGINAL_PROMOTION_SERIES[0];
    render(<PdfCoverThumbnail pdfId="external-issue" seriesPublicationId="unrelated" title={series.title} thumbnailUrl="/external.png" />);
    expect(screen.getByRole("img", { name: "First page of " + series.title }).getAttribute("src")).toBe("/external.png");
  });
});
