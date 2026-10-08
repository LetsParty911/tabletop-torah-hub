import { describe, expect, it } from "vitest";
import { R_REDIRECT_TARGET } from "./r-redirect";

describe("R_REDIRECT_TARGET", () => {
  it("points at the torahforthetable.com homepage, not another host", () => {
    const url = new URL(R_REDIRECT_TARGET);
    expect(url.hostname).toBe("torahforthetable.com");
    expect(url.pathname).toBe("/");
  });

  it("carries exactly the approved OurKehilla poster attribution", () => {
    const url = new URL(R_REDIRECT_TARGET);
    expect(url.searchParams.get("utm_source")).toBe("ourkehilla");
    expect(url.searchParams.get("utm_medium")).toBe("email");
    expect(url.searchParams.get("utm_campaign")).toBe("poster_oct2026");
    // No extra params (e.g. utm_content) beyond the three approved values.
    expect([...url.searchParams.keys()].sort()).toEqual([
      "utm_campaign",
      "utm_medium",
      "utm_source",
    ]);
  });
});
