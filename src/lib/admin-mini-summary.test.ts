import { describe, expect, it } from "vitest";
import { hasAdminMiniActivity } from "./admin-mini-summary";

const empty = {
  sessions: 0,
  openPdfClicks: 0,
  downloadActions: 0,
  newSubscriberCount: 0,
  newContactCount: 0,
};

describe("admin since-last activity empty state", () => {
  it("is empty only when every tracked signal is zero", () => {
    expect(hasAdminMiniActivity(empty)).toBe(false);
  });

  it("treats an Open PDF click as activity without a separate download", () => {
    expect(hasAdminMiniActivity({ ...empty, openPdfClicks: 1 })).toBe(true);
  });

  it("treats a separate download as activity without an Open PDF click", () => {
    expect(hasAdminMiniActivity({ ...empty, downloadActions: 1 })).toBe(true);
  });
});