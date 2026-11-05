import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const record = vi.hoisted(() => vi.fn());
vi.mock("./DownloadToPrintButton", () => ({ recordPdfAction: record }));
import { PdfCoverThumbnail } from "./PdfCoverThumbnail";
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