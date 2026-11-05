// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  captureEventAttribution,
  captureFirstTouch,
  getFirstTouch,
  getSessionId,
} from "./first-party-analytics";

const emailUrl =
  "/?utm_source=sender.net&utm_medium=email&utm_campaign=chayei_sarah_5787&utm_content=main_button";

beforeEach(() => {
  localStorage.clear();
  document.cookie = "tftt_vid=; Path=/; Max-Age=0";
  window.history.replaceState({}, "", "/");
});

describe("campaign attribution after an existing Direct first touch", () => {
  it("keeps first touch Direct but tags email arrival and subsequent actions", () => {
    const initial = captureFirstTouch("/");
    expect(initial.source_group).toBe("Direct");
    expect(initial.utm_campaign).toBeNull();
    const session = getSessionId();

    window.history.replaceState({}, "", emailUrl);
    const campaignEvent = captureEventAttribution("/");
    expect(getSessionId()).toBe(session);
    expect(campaignEvent).toMatchObject({
      utm_source: "sender.net",
      utm_medium: "email",
      utm_campaign: "chayei_sarah_5787",
      utm_content: "main_button",
      source_group: "Email",
    });
    expect(getFirstTouch()?.source_group).toBe("Direct");
    expect(getFirstTouch()?.utm_campaign).toBeNull();

    window.history.replaceState({}, "", "/view/example");
    expect(captureEventAttribution("/view/example").utm_campaign).toBe("chayei_sarah_5787");
  });

  it("ignores partial UTM tags and resets campaign attribution on a fresh session", () => {
    captureFirstTouch("/");
    window.history.replaceState({}, "", emailUrl);
    expect(captureEventAttribution("/").source_group).toBe("Email");

    // A stale stored session triggers the existing 30-minute rollover logic.
    const key = "tftt:fp-session";
    const stored = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...stored, last: Date.now() - 31 * 60_000 }));
    window.history.replaceState({}, "", "/");
    const next = captureEventAttribution("/");
    expect(next.source_group).toBe("Direct");
    expect(next.utm_campaign).toBeNull();

    window.history.replaceState({}, "", "/?utm_source=sender.net");
    expect(captureEventAttribution("/").source_group).toBe("Direct");
  });

  it("supports an explicit second campaign within the same session", () => {
    window.history.replaceState({}, "", emailUrl);
    const first = captureEventAttribution("/");
    expect(first.utm_campaign).toBe("chayei_sarah_5787");
    window.history.replaceState({}, "", "/?utm_source=whatsapp&utm_medium=share&utm_campaign=weekly_share");
    const second = captureEventAttribution("/");
    expect(second).toMatchObject({
      utm_source: "whatsapp",
      utm_campaign: "weekly_share",
      source_group: "WhatsApp",
    });
    // First-touch attribution remains unchanged for session-level reports.
    expect(getFirstTouch()?.utm_campaign).toBe("chayei_sarah_5787");
  });
});
