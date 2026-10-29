import React from "react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpdateCountdown } from "./UpdateCountdown";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

for (const reducedMotion of [false, true]) {
  for (const activation of ["keyboard", "pointer"]) {
    it(`targets the single homepage email field on ${activation} activation (reduced motion: ${reducedMotion})`, async () => {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: vi.fn(() => ({ matches: reducedMotion })),
      });
      const scroll = vi.fn();
      render(
        <>
          <UpdateCountdown liveParshaLabel="Noach" readingDate="2026-10-24" />
          <div id="weekly-email-signup">
            <input type="email" aria-label="Weekly email" />
          </div>
        </>,
      );
      const signup = document.getElementById("weekly-email-signup");
      if (!signup) throw new Error("Missing signup");
      signup.scrollIntoView = scroll;
      const link = screen.getByRole("link", { name: "Subscribe" });
      expect(link.getAttribute("href")).toBe("#weekly-email-signup");
      if (activation === "keyboard") {
        await userEvent.tab();
        expect(document.activeElement).toBe(link);
        await userEvent.keyboard("{Enter}");
      } else {
        await userEvent.click(link);
      }
      expect(scroll).toHaveBeenCalledWith({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
      expect(document.activeElement).toBe(screen.getByLabelText("Weekly email"));
    });
  }
}

it("retains collection navigation when content is live", () => {
  render(<UpdateCountdown contentLive availableCount={30} liveParshaLabel="Noach" />);
  expect(screen.getByRole("link").getAttribute("href")).toBe("#this-weeks-collection");
});


it("scrolls the compact countdown Subscribe link to the one homepage email form", async () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
  const scroll = vi.fn();
  render(
    <>
      <UpdateCountdown compact liveParshaLabel="Noach" readingDate="2026-10-24" />
      <div id="weekly-email-signup">
        <input type="email" aria-label="Weekly email" />
      </div>
    </>,
  );
  const signup = document.getElementById("weekly-email-signup");
  if (!signup) throw new Error("Missing signup");
  signup.scrollIntoView = scroll;
  const link = screen.getByRole("link", { name: "Subscribe for the weekly email" });
  expect(link.getAttribute("href")).toBe("#weekly-email-signup");
  await userEvent.click(link);
  expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  expect(document.activeElement).toBe(screen.getByLabelText("Weekly email"));
});

describe("real release deadline transitions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T23:59:59Z"));
  });
  it("expires without offering a live collection and switches only on real publications", async () => {
    const { act } = await import("@testing-library/react");
    const view = render(<UpdateCountdown liveParshaLabel="Lech-Lecha" readingDate="2026-10-24" availableCount={0} />);
    expect(screen.getByRole("timer")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.queryByRole("link", { name: /Browse this week/ })).toBeNull();
    view.rerender(<UpdateCountdown contentLive liveParshaLabel="Lech-Lecha" readingDate="2026-10-24" availableCount={0} />);
    expect(screen.queryByRole("link", { name: /Browse this week/ })).toBeNull();
    view.rerender(<UpdateCountdown contentLive liveParshaLabel="Lech-Lecha" readingDate="2026-10-24" availableCount={1} />);
    expect(screen.getByRole("link", { name: /Browse this week/ }).getAttribute("href")).toBe("#this-weeks-collection");
  });
});
