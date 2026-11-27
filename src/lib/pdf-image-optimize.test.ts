// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { optimizePdfImages, PDF_OPTIMIZATION_MIN_BYTES } from "./pdf-image-optimize.server";

describe("PDF upload compatibility", () => {
  it("preserves a small conventional PDF exactly instead of packing objects", async () => {
    const doc = await PDFDocument.create();
    doc.addPage().drawText("Preserve these exact PDF bytes.");
    const original = Buffer.from(await doc.save({ useObjectStreams: false }));
    expect(original.length).toBeLessThan(PDF_OPTIMIZATION_MIN_BYTES);
    expect(original.toString("latin1")).toContain("\nxref\n");
    const result = await optimizePdfImages(original);
    expect(result).toBe(original);
    expect(result.equals(original)).toBe(true);
  });

  it("preserves a large PDF with no eligible JPEG images exactly", async () => {
    const doc = await PDFDocument.create();
    doc.addPage().drawText("Text-only publication");
    doc.setSubject("x".repeat(PDF_OPTIMIZATION_MIN_BYTES));
    const original = Buffer.from(await doc.save({ useObjectStreams: false }));
    expect(original.length).toBeGreaterThan(PDF_OPTIMIZATION_MIN_BYTES);
    expect(await optimizePdfImages(original)).toBe(original);
  });
});
