import { describe, expect, it } from "vitest";
import { WA_REDIRECT_TARGET } from "./wa-redirect";

describe("WA_REDIRECT_TARGET", () => {
  it("points at the torahforthetable.com homepage, not another host", () => {
    const url = new URL(WA_REDIRECT_TARGET);
    expect(url.hostname).toBe("torahforthetable.com");
    expect(url.pathname).toBe("/");
  });

  it("carries exactly the approved WhatsApp attribution", () => {
    const url = new URL(WA_REDIRECT_TARGET);
    expect(url.searchParams.get("utm_source")).toBe("whatsapp");
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.get("utm_campaign")).toBe("bereishis");
    // No extra params (e.g. utm_content) beyond the three approved values.
    expect([...url.searchParams.keys()].sort()).toEqual([
      "utm_campaign",
      "utm_medium",
      "utm_source",
    ]);
  });
});
