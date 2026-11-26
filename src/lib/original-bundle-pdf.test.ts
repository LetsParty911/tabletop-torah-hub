import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { currentOriginalBundles } from "@/lib/original-bundles";
import { ORIGINAL_PROMOTION_SERIES } from "@/lib/originals-promotion";
import { mergeOriginalBundlePdf } from "@/lib/original-bundle-pdf";

async function pdfWithPageSizes(sizes: Array<[number, number]>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  sizes.forEach(([width, height]) => pdf.addPage([width, height]));
  return pdf.save();
}

afterEach(() => vi.unstubAllGlobals());

describe("mergeOriginalBundlePdf", () => {
  it("preserves all pages and their order in one printable PDF", async () => {
    const first = await pdfWithPageSizes([[200, 400], [210, 420]]);
    const second = await pdfWithPageSizes([[300, 600]]);
    const files = new Map([
      ["https://example.test/qa.pdf", first],
      ["https://example.test/stories.pdf", second],
    ]);
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
      const bytes = files.get(String(url));
      return bytes ? new Response(bytes, { status: 200 }) : new Response(null, { status: 404 });
    }));
    const resources = ORIGINAL_PROMOTION_SERIES.slice(0, 2).map((series, index) => ({
      id: `id-${index}`,
      title: series.title,
      url: `https://example.test/${series.key}.pdf`,
      parsha_key: "vayetzei",
      publication_id: series.publicationId,
    }));
    const bundle = currentOriginalBundles(resources, "vayetzei", false)[0]!;
    const result = await mergeOriginalBundlePdf(bundle);
    expect(result.pageCount).toBe(3);
    expect(result.blob.type).toBe("application/pdf");
    const merged = await PDFDocument.load(await result.blob.arrayBuffer());
    expect(merged.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([
      [200, 400], [210, 420], [300, 600],
    ]);
  });

  it("fails visibly instead of merging an incomplete bundle", async () => {
    const bundle = currentOriginalBundles([], "vayetzei", false)[0]!;
    await expect(mergeOriginalBundlePdf(bundle)).rejects.toThrow("All constituent PDFs must be available");
  });

  it("rejects a non-PDF response rather than producing a broken file", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>not a pdf</html>", { status: 200 })));
    const resources = ORIGINAL_PROMOTION_SERIES.slice(0, 2).map((series, index) => ({
      id: `id-${index}`,
      title: series.title,
      url: `https://example.test/${series.key}.pdf`,
      parsha_key: "vayetzei",
      publication_id: series.publicationId,
    }));
    const bundle = currentOriginalBundles(resources, "vayetzei", false)[0]!;
    await expect(mergeOriginalBundlePdf(bundle)).rejects.toThrow("did not return a valid PDF");
  });
});
