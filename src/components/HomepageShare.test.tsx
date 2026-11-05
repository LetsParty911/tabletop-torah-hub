import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HomepageShare } from "./HomepageShare";
import { homepageCopyUrl, homepageWhatsAppUrl, homepageWhatsAppHref } from "@/lib/homepage-share-links";
import { trackFp } from "@/lib/first-party-analytics";
vi.mock("@/lib/first-party-analytics", () => ({ trackFp: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe("homepage sharing", () => {
  it("preserves all legacy WhatsApp attribution parameters", () => {
    const url = new URL(homepageWhatsAppUrl);
    expect(url.origin + url.pathname).toBe("https://torahforthetable.com/");
    expect(Object.fromEntries(url.searchParams)).toEqual({ utm_source: "whatsapp", utm_medium: "share", utm_campaign: "weekly-share", utm_content: "veahavta-home" });
    expect(new URL(homepageWhatsAppHref).searchParams.get("text")).toContain(homepageWhatsAppUrl);
  });
  it("gives copied links distinct attribution to the canonical homepage", () => {
    const url = new URL(homepageCopyUrl);
    expect(url.origin + url.pathname).toBe("https://torahforthetable.com/");
    expect(url.searchParams.get("utm_source")).toBe("copy-link");
    expect(url.searchParams.get("utm_medium")).toBe("share");
    expect(url.searchParams.get("utm_campaign")).toBe("weekly-share");
  });
  it("uses the existing WhatsApp click handler", () => {
    const onWhatsApp = vi.fn(); render(<HomepageShare onWhatsApp={onWhatsApp} />);
    fireEvent.click(screen.getByRole("link", { name: "Share on WhatsApp" }));
    expect(onWhatsApp).toHaveBeenCalledTimes(1);
  });
  it("copies the tracked link and emits copy_link only after success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<HomepageShare onWhatsApp={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Website Link" }));
    await waitFor(() => expect(trackFp).toHaveBeenCalledWith("share_click", { metadata: { placement: "homepage_veahavta", share_method: "copy_link" } }));
    expect(writeText).toHaveBeenCalledWith(homepageCopyUrl);
    expect(screen.getByRole("status").textContent).toBe("Link copied!");
  });
  it("never claims success or tracks when clipboard rejects; supplies selectable link", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<HomepageShare onWhatsApp={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Website Link" }));
    await screen.findByRole("textbox", { name: "Website link" });
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(homepageCopyUrl);
    expect(trackFp).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).not.toBe("Link copied!");
  });
  it("provides fallback when clipboard API is unavailable", async () => {
    vi.stubGlobal("navigator", {}); render(<HomepageShare onWhatsApp={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Website Link" }));
    await screen.findByRole("textbox", { name: "Website link" });
    expect(trackFp).not.toHaveBeenCalled();
  });
});