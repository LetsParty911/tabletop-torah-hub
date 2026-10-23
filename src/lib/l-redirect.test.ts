import { describe, expect, it } from "vitest";
import { L_REDIRECT_TARGET } from "./l-redirect";
import { WA_REDIRECT_TARGET } from "./wa-redirect";
import { ST_REDIRECT_TARGET } from "./st-redirect";

describe("L_REDIRECT_TARGET", () => {
  it("redirects to the normal homepage for existing canonical analytics", () => {
    const url = new URL(L_REDIRECT_TARGET);
    expect(url.hostname).toBe("torahforthetable.com");
    expect(url.protocol).toBe("https:");
    expect(url.pathname).toBe("/");
    expect(url.hash).toBe("");
  });

  it("tags last-minute readers as their own WhatsApp content variant", () => {
    const url = new URL(L_REDIRECT_TARGET);
    expect(url.searchParams.get("utm_source")).toBe("whatsapp");
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.get("utm_campaign")).toBe("weekly_parsha");
    expect(url.searchParams.get("utm_content")).toBe("last_minute");
    expect([...url.searchParams.keys()].sort()).toEqual([
      "utm_campaign",
      "utm_content",
      "utm_medium",
      "utm_source",
    ]);
  });

  it("does not collide with the general WhatsApp or Status links", () => {
    expect(L_REDIRECT_TARGET).not.toBe(WA_REDIRECT_TARGET);
    expect(L_REDIRECT_TARGET).not.toBe(ST_REDIRECT_TARGET);
    expect(new URL(WA_REDIRECT_TARGET).searchParams.has("utm_content")).toBe(false);
    expect(new URL(ST_REDIRECT_TARGET).searchParams.get("utm_content")).toBe("st");
  });
});
