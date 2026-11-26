import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/first-party-analytics", () => ({
  trackFp: track,
  getSessionId: () => "session-abc123",
  getVisitorId: () => "visitor-abc123",
}));
import { DownloadToPrintButton } from "./DownloadToPrintButton";

const ID = "16c4aa36-b60c-4801-9edb-49eece0cfcb0";
afterEach(() => { cleanup(); track.mockClear(); });

function renderReader() {
  render(<DownloadToPrintButton href={`/view/${ID}/pdf`} publicationId={ID} showDownload publicationTitle="Against All Odds" parsha="Vayishlach" labelYear={5787} />);
}

describe("reader PDF actions share one action ID with the server route", () => {
  it("Download PDF sends download with metadata.action_id equal to the link's ?a= and the catalogue year", () => {
    renderReader();
    const link = screen.getByRole("link", { name: /download/i }) as HTMLAnchorElement;
    fireEvent.click(link);
    const url = new URL(link.href, "https://x.test");
    expect(url.pathname).toBe(`/view/${ID}/download`);
    expect(url.searchParams.get("s")).toBe("session-abc123");
    expect(url.searchParams.get("v")).toBe("visitor-abc123");
    expect(track).toHaveBeenCalledTimes(1);
    const [name, payload] = track.mock.calls[0]!;
    expect(name).toBe("download");
    expect(payload.metadata.action_id).toBe(url.searchParams.get("a"));
    expect(payload.metadata.action).toBe("download");
    expect(payload.jewish_year).toBe(5787);
    expect(payload.parsha).toBe("Vayishlach");
  });

  it("Read Now stays a separate open_pdf click with its own action ID", () => {
    renderReader();
    fireEvent.click(screen.getByRole("link", { name: /download/i }));
    const read = screen.getByRole("link", { name: /^Open PDF in a new tab/i }) as HTMLAnchorElement;
    fireEvent.click(read);
    const [name, payload] = track.mock.calls[1]!;
    expect(name).toBe("publication_click");
    expect(payload.metadata.action).toBe("open_pdf");
    expect(new URL(read.href, "https://x.test").pathname).toBe(`/view/${ID}/pdf`);
    expect(payload.metadata.action_id).toBe(new URL(read.href, "https://x.test").searchParams.get("a"));
    expect(payload.metadata.action_id).not.toBe(track.mock.calls[0]![1].metadata.action_id);
  });

  it("offers a native PDF viewer fallback on the detail page without counting it as a download", () => {
    renderReader();
    const link = screen.getByRole("link", { name: /Open PDF to save or print on iPhone or iPad/i }) as HTMLAnchorElement;
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText(/tap Share, then choose Save to Files or Print/i)).toBeTruthy();
    fireEvent.click(link);
    const url = new URL(link.href, "https://x.test");
    expect(url.pathname).toBe(`/view/${ID}/pdf`);
    expect(track).toHaveBeenCalledTimes(1);
    const [name, payload] = track.mock.calls[0]!;
    expect(name).toBe("publication_click");
    expect(payload.metadata).toMatchObject({ action: "open_pdf", entry_point: "save_or_print", action_id: url.searchParams.get("a") });
  });

  it("keeps the collection-card action unchanged", () => {
    render(<DownloadToPrintButton href={`/view/${ID}/pdf`} publicationId={ID} publicationTitle="Against All Odds" />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByText(/Saving or printing on iPhone or iPad/i)).toBeNull();
  });
});
