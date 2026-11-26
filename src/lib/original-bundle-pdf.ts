import { PDFDocument } from "pdf-lib";
import type { OriginalBundle } from "@/lib/original-bundles";

export type BundlePdfProgress = {
  completed: number;
  total: number;
  title: string;
};

/**
 * Fetch only the already-public constituent files and preserve every page in order.
 * This module is imported dynamically after an explicit visitor action.
 */
export async function mergeOriginalBundlePdf(
  bundle: OriginalBundle,
  onProgress?: (progress: BundlePdfProgress) => void,
): Promise<{ blob: Blob; pageCount: number }> {
  if (!bundle.isComplete) throw new Error("All constituent PDFs must be available before merging.");

  const merged = await PDFDocument.create();
  for (const [index, item] of bundle.items.entries()) {
    const resource = item.resource;
    if (!resource) throw new Error(`${item.series.title} is not available this week.`);
    onProgress?.({ completed: index, total: bundle.items.length, title: item.series.title });

    const response = await fetch(resource.url, { credentials: "omit" });
    if (!response.ok) throw new Error(`${item.series.title} could not be loaded.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
      throw new Error(`${item.series.title} did not return a valid PDF.`);
    }

    const source = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }

  merged.setTitle(bundle.title);
  merged.setSubject(`${bundle.title} — current published editions`);
  merged.setCreator("Torah For The Table");
  const bytes = await merged.save();
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  onProgress?.({ completed: bundle.items.length, total: bundle.items.length, title: bundle.title });
  return {
    blob: new Blob([output.buffer], { type: "application/pdf" }),
    pageCount: merged.getPageCount(),
  };
}
