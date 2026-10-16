import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpdateCountdown } from "./UpdateCountdown";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

for (const reducedMotion of [false, true]) {
  for (const activation of ["keyboard", "pointer"]) {
    it(`targets the top email field on ${activation} activation (reduced motion: ${reducedMotion})`, async () => {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: vi.fn(() => ({ matches: reducedMotion })),
      });
      const scroll = vi.fn();
      render(
        <>
          <UpdateCountdown liveParshaLabel="Noach" readingDate="2026-10-24" />
          <div id="weekly-email-signup-top">
            <input type="email" aria-label="Top email" />
          </div>
          <div id="weekly-email-signup">
            <input type="email" aria-label="Lower email" />
          </div>
        </>,
      );
      document.getElementById("weekly-email-signup-top")!.scrollIntoView = scroll;
      const link = screen.getByRole("link", { name: "Subscribe" });
      expect(link.getAttribute("href")).toBe("#weekly-email-signup-top");
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
      expect(document.activeElement).toBe(screen.getByLabelText("Top email"));
    });
  }
}

it("retains collection navigation when content is live", () => {
  render(<UpdateCountdown contentLive liveParshaLabel="Noach" />);
  expect(screen.getByRole("link").getAttribute("href")).toBe("#this-weeks-collection");
});
