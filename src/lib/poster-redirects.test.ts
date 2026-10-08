import { describe, expect, it } from "vitest";
import { R_REDIRECT_TARGET } from "./r-redirect";
import { S_REDIRECT_TARGET } from "./s-redirect";
import { J_REDIRECT_TARGET } from "./j-redirect";

/**
 * Poster short links: /r (OurKehilla), /s (shul), /j (workplace).
 * Each is a single fixed target; inbound query strings are ignored by the
 * route handler, so only these three approved values can ever reach the
 * homepage.
 */
describe("poster short-link targets", () => {
  const cases = [
    {
      name: "/s (shul poster)",
      target: S_REDIRECT_TARGET,
      utm_source: "shul",
      utm_medium: "poster",
      utm_campaign: "evergreen_poster_oct2026",
    },
    {
      name: "/j (workplace poster)",
      target: J_REDIRECT_TARGET,
      utm_source: "workplace",
      utm_medium: "poster",
      utm_campaign: "evergreen_poster_oct2026",
    },
    {
      name: "/r (OurKehilla poster, unchanged)",
      target: R_REDIRECT_TARGET,
      utm_source: "ourkehilla",
      utm_medium: "email",
      utm_campaign: "poster_oct2026",
    },
  ] as const;

  for (const testCase of cases) {
    describe(testCase.name, () => {
      it("points at the torahforthetable.com homepage, not another host", () => {
        const url = new URL(testCase.target);
        expect(url.hostname).toBe("torahforthetable.com");
        expect(url.pathname).toBe("/");
      });

      it("carries exactly the approved attribution, with no extra params", () => {
        const url = new URL(testCase.target);
        expect(url.searchParams.get("utm_source")).toBe(testCase.utm_source);
        expect(url.searchParams.get("utm_medium")).toBe(testCase.utm_medium);
        expect(url.searchParams.get("utm_campaign")).toBe(testCase.utm_campaign);
        expect([...url.searchParams.keys()].sort()).toEqual([
          "utm_campaign",
          "utm_medium",
          "utm_source",
        ]);
      });
    });
  }

  it("keeps the three destinations distinct so reports never merge", () => {
    const sources = new Set([
      new URL(S_REDIRECT_TARGET).searchParams.get("utm_source"),
      new URL(J_REDIRECT_TARGET).searchParams.get("utm_source"),
      new URL(R_REDIRECT_TARGET).searchParams.get("utm_source"),
    ]);
    expect(sources.size).toBe(3);
    // Same campaign naming for the two evergreen posters, distinct sources.
    expect(new URL(S_REDIRECT_TARGET).searchParams.get("utm_campaign")).toBe(
      new URL(J_REDIRECT_TARGET).searchParams.get("utm_campaign"),
    );
  });

  it("does not leak a venue or advertiser name into the visible short path", () => {
    for (const target of [S_REDIRECT_TARGET, J_REDIRECT_TARGET, R_REDIRECT_TARGET]) {
      const url = new URL(target);
      expect(url.pathname).toBe("/");
      expect(url.username).toBe("");
      expect(url.password).toBe("");
      expect(url.hash).toBe("");
      // Only the three UTM keys; nothing that identifies a specific venue.
      expect([...url.searchParams.keys()]).toEqual(
        expect.arrayContaining(["utm_source", "utm_medium", "utm_campaign"]),
      );
      expect(url.searchParams.keys().length).toBe(3);
    }
  });
});
