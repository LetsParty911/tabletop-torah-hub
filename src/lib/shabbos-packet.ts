import { TFTT_ORIGINAL_EDITION_SERIES } from "./tftt-originals";
import { pdfActionHrefs } from "./collection-status";

export const PACKET_MAX_FILES = 7;
export const PACKET_MAX_PAGES = 100;
export const PACKET_MAX_BYTES = 25 * 1024 * 1024;
export const PACKET_MAX_OUTPUT_BYTES = 30 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const approved = new Map(TFTT_ORIGINAL_EDITION_SERIES.map(s => [s.id, s.title]));

type WeeklyResource = {
  id: string;
  publication_id?: string | null;
  page_count?: number | null;
};

export type PacketEntry = {
  id: string;
  publicationId: string;
  title: string;
  pageCount: number | null;
};

/** Only the registered seven active original series, in current list order.
 * Never include third-party publications or the previous-week fallback.
 * The existing public PDF route still verifies publication and site access. */
export function packetCandidates(resources: readonly WeeklyResource[], isFallback: boolean): PacketEntry[] {
  if (isFallback) return [];
  const seen = new Set<string>();
  return resources.flatMap(r => {
    const publicationId = r.publication_id;
    const title = publicationId ? approved.get(publicationId) : undefined;
    if (!publicationId || !title || !UUID.test(r.id) || seen.has(r.id)) return [];
    seen.add(r.id);
    const pageCount = typeof r.page_count === "number" && Number.isInteger(r.page_count) && r.page_count > 0
      ? r.page_count : null;
    return [{ id: r.id, publicationId, title, pageCount }];
  });
}

export function packetFilename(readingLabel: string, readingDate?: string | null): string {
  const label = readingLabel.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  const date = readingDate && /^\d{4}-\d{2}-\d{2}$/.test(readingDate) ? readingDate : "";
  return ["TFTT", "My_Shabbos_Packet", label, date].filter(Boolean).join("_") + ".pdf";
}

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Packet preparation cancelled.");
}

/** Limit actual streamed bytes, not only the claimed response length. */
export async function readPacketPdf(response: Response, budget: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (!response.ok) throw new Error("This PDF is currently unavailable.");
  const claimedLength = Number(response.headers.get("content-length") ?? 0);
  if (budget <= 0 || (Number.isFinite(claimedLength) && claimedLength > budget)) {
    await response.body?.cancel().catch(() => {});
    throw new Error("The selected PDFs exceed the packet size limit. Choose fewer publications.");
  }
  if (!response.body) throw new Error("This browser cannot read the PDF response.");
  const reader = response.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      ensureNotAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > budget) {
        throw new Error("The selected PDFs exceed the packet size limit. Choose fewer publications.");
      }
      chunks.push(value);
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/** Client-side assembly only: no server merger, upload, account, or storage
 * object. No analytics tags are added to the individual delivery requests;
 * preparation is not a set of individual Read Now or Download PDF clicks.
 * Lazy-load pdf-lib only after an explicit Create packet action.
 * Copy complete pages without rasterizing, resizing or editing Torah text.
 * No partial packet is returned if any source fails. */
export async function createShabbosPacket(
  entries: readonly PacketEntry[],
  options: { signal?: AbortSignal; fetchPdf?: typeof fetch; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  if (entries.length < 2 || entries.length > PACKET_MAX_FILES ||
      new Set(entries.map(e => e.id)).size !== entries.length ||
      entries.some(e => !UUID.test(e.id) || !approved.has(e.publicationId))) {
    throw new Error("Choose two to seven eligible Torah For The Table originals.");
  }
  const { signal, fetchPdf = fetch, onProgress } = options;
  ensureNotAborted(signal);
  const { PDFDocument } = await import("pdf-lib");
  const packet = await PDFDocument.create();
  let bytesUsed = 0;
  let pageCount = 0;
  for (const entry of entries) {
    ensureNotAborted(signal);
    try {
      // Existing same-origin download endpoint checks maintenance and published
      // status, then redirects to the storage CDN. Do not request admin bypass.
      const response = await fetchPdf(pdfActionHrefs(entry.id).download, {
        credentials: "same-origin", redirect: "follow", signal,
      });
      const bytes = await readPacketPdf(response, PACKET_MAX_BYTES - bytesUsed, signal);
      bytesUsed += bytes.byteLength;
      const document = await PDFDocument.load(bytes, { updateMetadata: false });
      const indices = document.getPageIndices();
      if (indices.length === 0 || pageCount + indices.length > PACKET_MAX_PAGES) {
        throw new Error("The packet exceeds the page limit. Choose fewer publications.");
      }
      const copied = await packet.copyPages(document, indices);
      copied.forEach(page => packet.addPage(page));
      pageCount += copied.length;
      ensureNotAborted(signal);
    } catch (error) {
      ensureNotAborted(signal);
      const detail = error instanceof Error && /size limit|page limit|currently unavailable/.test(error.message)
        ? error.message : "Could not prepare this PDF. Try again or use its individual download.";
      throw new Error(`${entry.title}: ${detail}`);
    }
    onProgress?.(entries.indexOf(entry) + 1, entries.length);
  }
  ensureNotAborted(signal);
  packet.setTitle("My Shabbos Packet");
  const bytes = await packet.save();
  ensureNotAborted(signal);
  if (bytes.byteLength > PACKET_MAX_OUTPUT_BYTES) {
    throw new Error("The combined PDF is too large. Choose fewer publications.");
  }
  return { bytes, pageCount };
}
