import { PDFDocument } from "pdf-lib";
import type { OriginalBundle } from "@/lib/original-bundles";
import { BundlePdfError } from "@/lib/bundle-diagnostics";

const PDF_FETCH_TIMEOUT_MS = 45_000;

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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS);
    let bytes: Uint8Array;
    try {
      const response = await fetch(resource.url, { credentials: "omit", signal: controller.signal });
      if (!response.ok) throw new BundlePdfError(
        `${item.series.title} could not be loaded.`, "http_error", resource.id, response.status,
      );
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof BundlePdfError) throw error;
      throw new BundlePdfError(
        `${item.series.title} could not be loaded.`,
        controller.signal.aborted ? "fetch_timeout" : "fetch_failed", resource.id,
      );
    } finally {
      clearTimeout(timeout);
    }
    if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
      throw new BundlePdfError(`${item.series.title} did not return a valid PDF.`, "invalid_pdf", resource.id);
    }

    try {
      const source = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(source, source.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    } catch {
      throw new BundlePdfError(`${item.series.title} could not be combined.`, "pdf_parse_or_merge_failed", resource.id);
    }
  }

  merged.setTitle(bundle.title);
  merged.setSubject(`${bundle.title} — current published editions`);
  merged.setCreator("Torah For The Table");
  let bytes: Uint8Array;
  try { bytes = await merged.save(); }
  catch { throw new BundlePdfError("The combined PDF could not be saved.", "pdf_save_failed"); }
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  onProgress?.({ completed: bundle.items.length, total: bundle.items.length, title: bundle.title });
  return {
    blob: new Blob([output.buffer], { type: "application/pdf" }),
    pageCount: merged.getPageCount(),
  };
}
