import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import OriginalCoverManager from "./OriginalCoverManager";
import { ORIGINAL_PROMOTION_SERIES } from "@/lib/originals-promotion";
import type { PdfRow } from "@/lib/pdf-constants";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(async (_args: unknown) => ({ ok: true, error: null })),
  renderCover: vi.fn(async (_file: File) => "png-data"),
  renderSmall: vi.fn(async (_png: string) => "webp-data"),
}));
vi.mock("@/integrations/supabase/api.functions", () => ({ adminUploadPdfThumb: mocks.upload }));
vi.mock("@/lib/pdf-thumb", () => ({
  renderManualCoverBase64: mocks.renderCover,
  renderSmallThumbBase64: mocks.renderSmall,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const rows = ORIGINAL_PROMOTION_SERIES.map((series, index): PdfRow => ({
  id: "issue-" + index,
  publication_id: series.publicationId,
  title: series.title,
  parsha_key: "Vayetzei",
  jewish_year: 5787,
  created_at: "2026-11-17T00:00:00Z",
  published: true,
  subtitle: null,
  file_path: "file.pdf",
  summary_quick: null,
  content_type: null,
}));

describe("original series manual cover management", () => {
  it("provides all seven controls and updates only the selected latest published PDF thumbnail", async () => {
    const title = ORIGINAL_PROMOTION_SERIES[4].title;
    const draft = { ...rows[4], id: "unpublished-draft", parsha_key: "Vayishlach", published: false };
    render(<OriginalCoverManager accessToken="test-token" pdfs={[...rows, draft]} />);
    expect(screen.getAllByRole("button", { name: /^Save cover for / })).toHaveLength(7);
    const input = screen.getByLabelText(title + " cover file");
    const file = new File(["cover"], "cover.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Save cover for " + title }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith({
      data: { accessToken: "test-token", id: rows[4].id, pngBase64: "png-data", smallWebpBase64: "webp-data" },
    }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Cover saved"));
  });
  it("does not enable thumbnail upload before a matching issue is published", () => {
    render(<OriginalCoverManager accessToken="test-token" pdfs={[]} />);
    expect(screen.getAllByRole("button", { name: /^Save cover for / }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });
});
