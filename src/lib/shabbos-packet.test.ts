// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { TFTT_ORIGINAL_EDITION_SERIES, PARSHA_DETECTIVE_PUBLICATION_ID } from "./tftt-originals";
import { createShabbosPacket, packetCandidates, packetFilename, readPacketPdf, PACKET_MAX_FILES } from "./shabbos-packet";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rows = TFTT_ORIGINAL_EDITION_SERIES.map((series, index) => ({
  id: id(index + 1), publication_id: series.id, page_count: index + 1,
}));
const entries = packetCandidates(rows, false);

async function pdf(widths: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  widths.forEach(width => doc.addPage([width, 792]));
  return doc.save();
}
const pdfResponse = (bytes: Uint8Array) => new Response(new Uint8Array(bytes), {
  headers: { "Content-Type": "application/pdf" },
});

describe("My Shabbos Packet eligibility and naming", () => {
  it("includes the seven current registered originals without borrowing old or independent PDFs", () => {
    expect(entries).toHaveLength(7);
    expect(packetCandidates(rows, true)).toEqual([]);
    const candidates = packetCandidates([
      ...rows, rows[0],
      { id: id(30), publication_id: PARSHA_DETECTIVE_PUBLICATION_ID, page_count: 1 },
      { id: id(31), publication_id: null, page_count: 2 },
      { id: id(32), publication_id: id(33), page_count: 3 },
      { id: "not-a-pdf-id", publication_id: rows[0].publication_id, page_count: 2 },
    ], false);
    expect(candidates).toEqual(entries);
    expect(candidates[0].title).toBe(TFTT_ORIGINAL_EDITION_SERIES[0].title);
  });
  it("retains the displayed collection order and distinguishes unknown page counts", () => {
    const reversed = packetCandidates([...rows].reverse(), false);
    expect(reversed.map(e => e.id)).toEqual([...entries].reverse().map(e => e.id));
    expect(packetCandidates([{ ...rows[0], page_count: 0 }], false)[0].pageCount).toBeNull();
  });
  it("uses a friendly filename containing the reading and date", () => {
    expect(packetFilename("Parshas Vayishlach", "2026-11-28"))
      .toBe("TFTT_My_Shabbos_Packet_Parshas_Vayishlach_2026-11-28.pdf");
    expect(packetFilename("../? Vayetzei", "not-a-date"))
      .toBe("TFTT_My_Shabbos_Packet_Vayetzei.pdf");
  });
});

describe("browser-only PDF assembly", () => {
  it("fetches only selected entries from the existing gated download routes and copies complete pages in order", async () => {
    const first = await pdf([612, 420]);
    const second = await pdf([500]);
    const fetchPdf = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pdfResponse(first))
      .mockResolvedValueOnce(pdfResponse(second));
    const onProgress = vi.fn();
    const result = await createShabbosPacket([entries[0], entries[1]], { fetchPdf, onProgress });
    expect(fetchPdf.mock.calls.map(([url]) => url)).toEqual([
      `/view/${entries[0].id}/download`, `/view/${entries[1].id}/download`,
    ]);
    expect(fetchPdf.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", redirect: "follow" });
    expect(result.pageCount).toBe(3);
    const merged = await PDFDocument.load(result.bytes);
    expect(merged.getPages().map(page => page.getWidth())).toEqual([612, 420, 500]);
    expect(merged.getPages().map(page => page.getHeight())).toEqual([792, 792, 792]);
    expect(onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
  });

  it("rejects ineligible, duplicate, too few or excessive selections before fetching", async () => {
    const fetchPdf = vi.fn<typeof fetch>();
    for (const selection of [
      [entries[0]],
      [entries[0], entries[0]],
      [entries[0], { ...entries[1], publicationId: id(99) }],
      Array.from({ length: PACKET_MAX_FILES + 1 }, (_, i) => ({ ...entries[0], id: id(i + 50) })),
    ]) {
      await expect(createShabbosPacket(selection, { fetchPdf })).rejects.toThrow("Choose two to seven");
    }
    expect(fetchPdf).not.toHaveBeenCalled();
  });

  it("does not produce a partial packet when a selected source is withdrawn or returns HTML", async () => {
    const bytes = await pdf([612]);
    const unavailable = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(pdfResponse(bytes))
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }));
    await expect(createShabbosPacket(entries.slice(0, 2), { fetchPdf: unavailable })).rejects.toThrow("currently unavailable");
    const html = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("<html>Maintenance</html>"));
    await expect(createShabbosPacket(entries.slice(0, 2), { fetchPdf: html })).rejects.toThrow("Could not prepare this PDF");
    expect(html).toHaveBeenCalledTimes(1);
  });

  it("honors a cancelled request and actual streamed size limits", async () => {
    const fetchPdf = vi.fn<typeof fetch>();
    const controller = new AbortController();
    controller.abort();
    await expect(createShabbosPacket(entries.slice(0, 2), { fetchPdf, signal: controller.signal })).rejects.toThrow("cancelled");
    expect(fetchPdf).not.toHaveBeenCalled();
    await expect(readPacketPdf(new Response(new Uint8Array(16)), 8)).rejects.toThrow("size limit");
    await expect(readPacketPdf(new Response(new Uint8Array(2), { headers: { "Content-Length": "100" } }), 8)).rejects.toThrow("size limit");
  });
});
