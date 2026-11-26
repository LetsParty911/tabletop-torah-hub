import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TFTT_ORIGINAL_EDITION_SERIES } from "@/lib/tftt-originals";
import { MyShabbosPacket } from "./MyShabbosPacket";
import { type PacketEntry } from "@/lib/shabbos-packet";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/shabbos-packet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shabbos-packet")>()),
  createShabbosPacket: create,
}));

const entries: PacketEntry[] = TFTT_ORIGINAL_EDITION_SERIES.slice(0, 2).map((series, i) => ({
  id: `10000000-0000-4000-8000-00000000000${i + 1}`,
  publicationId: series.id, title: series.title, pageCount: i + 1,
}));
const url = "blob:packet-test";

afterEach(() => { cleanup(); vi.restoreAllMocks(); create.mockReset(); });

describe("packet selection dialog", () => {
  it("does not display when fewer than two eligible originals exist", () => {
    render(<MyShabbosPacket entries={entries.slice(0, 1)} readingLabel="Parshas Vayishlach" />);
    expect(screen.queryByRole("button", { name: "Build My Shabbos Packet" })).toBeNull();
  });
  it("selects without fetching, then prepares and exposes an explicit local download", async () => {
    const createUrl = vi.fn(() => url);
    const revoke = vi.fn();
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revoke;
    });
    try {
      create.mockResolvedValue({ bytes: new Uint8Array([1, 2]), pageCount: 3 });
      render(<MyShabbosPacket entries={entries} readingLabel="Parshas Vayishlach" readingDate="2026-11-28" />);
      fireEvent.click(screen.getByRole("button", { name: "Build My Shabbos Packet" }));
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect((screen.getByRole("button", { name: "Create packet" }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Select all" }));
      expect(create).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Create packet" }));
      await waitFor(() => expect(screen.getByRole("link", { name: "Download packet" })).toBeTruthy());
      const link = screen.getByRole("link", { name: "Download packet" });
      expect(link.getAttribute("href")).toBe(url);
      expect(link.getAttribute("download")).toBe("TFTT_My_Shabbos_Packet_Parshas_Vayishlach_2026-11-28.pdf");
      expect(create).toHaveBeenCalledWith(entries, expect.objectContaining({ signal: expect.anything() }));
      fireEvent.click(screen.getByRole("button", { name: "Clear" }));
      expect(screen.queryByRole("link", { name: "Download packet" })).toBeNull();
      expect(revoke).toHaveBeenCalledWith(url);
    } finally { vi.unstubAllGlobals(); }
  });
  it("retains selections and reports failure instead of offering a partial download", async () => {
    create.mockRejectedValue(new Error("This PDF is currently unavailable."));
    render(<MyShabbosPacket entries={entries} readingLabel="Parshas Vayishlach" />);
    fireEvent.click(screen.getByRole("button", { name: "Build My Shabbos Packet" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Create packet" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("currently unavailable"));
    expect(screen.queryByRole("link", { name: "Download packet" })).toBeNull();
    expect((screen.getByRole("button", { name: "Create packet" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
