import { describe, expect, it } from "vitest";
import { WA_REDIRECT_TARGET } from "./wa-redirect";
import { ST_REDIRECT_TARGET } from "./st-redirect";
import {
  WHATSAPP_GROUP_CONTENT,
  whatsappGroupRedirectTarget,
} from "./whatsapp-group-redirect";

describe("WhatsApp group short links", () => {
  const groups = [
    ["wap", "passaic_clifton"],
    ["wam", "our_side_of_main"],
    ["waz", "czs"],
  ] as const;

  it("only defines the three approved WhatsApp groups", () => {
    expect(WHATSAPP_GROUP_CONTENT).toEqual(Object.fromEntries(groups));
    expect(Object.keys(WHATSAPP_GROUP_CONTENT)).toHaveLength(3);
  });

  for (const [code, tag] of groups) {
    it(`/${code} tracks its group without changing the WhatsApp campaign`, () => {
      const url = new URL(whatsappGroupRedirectTarget(code));
      expect(url.origin).toBe("https://torahforthetable.com");
      expect(url.pathname).toBe("/");
      expect(url.searchParams.get("utm_source")).toBe("whatsapp");
      expect(url.searchParams.get("utm_medium")).toBe("social");
      expect(url.searchParams.get("utm_campaign")).toBe("weekly_parsha");
      expect(url.searchParams.get("utm_content")).toBe(tag);
      expect([...url.searchParams.keys()].sort()).toEqual([
        "utm_campaign",
        "utm_content",
        "utm_medium",
        "utm_source",
      ]);
    });
  }

  it("has independent identifiers and keeps /wa and /st unchanged", () => {
    const targets = groups.map(([code]) => whatsappGroupRedirectTarget(code));
    expect(new Set(targets).size).toBe(3);
    expect(targets).not.toContain(WA_REDIRECT_TARGET);
    expect(targets).not.toContain(ST_REDIRECT_TARGET);
    expect(new URL(WA_REDIRECT_TARGET).searchParams.has("utm_content")).toBe(false);
    expect(new URL(ST_REDIRECT_TARGET).searchParams.get("utm_content")).toBe("st");
  });
});
