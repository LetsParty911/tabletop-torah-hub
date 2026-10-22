import { describe, expect, it } from "vitest";
import { ST_REDIRECT_TARGET } from "./st-redirect";
import { WA_REDIRECT_TARGET } from "./wa-redirect";

describe("ST_REDIRECT_TARGET", () => {
  it("uses the normal homepage and its existing first-party analytics", () => {
    const url = new URL(ST_REDIRECT_TARGET);
    expect(url.hostname).toBe("torahforthetable.com");
    expect(url.pathname).toBe("/");
    expect(url.hash).toBe("");
  });

  it("uses approved WhatsApp UTMs with a separate discreet content variant", () => {
    const url = new URL(ST_REDIRECT_TARGET);
    expect(url.searchParams.get("utm_source")).toBe("whatsapp");
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.get("utm_campaign")).toBe("weekly_parsha");
    expect(url.searchParams.get("utm_content")).toBe("st");
    expect([...url.searchParams.keys()].sort()).toEqual([
      "utm_campaign",
      "utm_content",
      "utm_medium",
      "utm_source",
    ]);
  });

  it("does not alter or collide with the existing general WhatsApp link", () => {
    expect(ST_REDIRECT_TARGET).not.toBe(WA_REDIRECT_TARGET);
    expect(new URL(WA_REDIRECT_TARGET).searchParams.has("utm_content")).toBe(false);
  });
});
