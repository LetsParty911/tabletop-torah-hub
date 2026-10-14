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
import { describe as d2, it as i2, expect as e2 } from "vitest";
import { hasAdminMiniActivity as has2 } from "./admin-mini-summary";
d2("unconfirmed visits", () => {
  i2("stored but unqualified sessions prevent a false 'nothing new' state", () => {
    e2(has2({ sessions: 0, openPdfClicks: 0, downloadActions: 0, newSubscriberCount: 0, newContactCount: 0, unconfirmedSessions: 4 })).toBe(true);
    e2(has2({ sessions: 0, openPdfClicks: 0, downloadActions: 0, newSubscriberCount: 0, newContactCount: 0, unconfirmedSessions: 0 })).toBe(false);
    e2(has2({ sessions: 0, rawSessions: 2, openPdfClicks: 0, downloadActions: 0, newSubscriberCount: 0, newContactCount: 0, unconfirmedSessions: 0 })).toBe(true);
  });
});
