import { describe, it, expect } from "vitest";
import { blockedResponse, BLOCKED_CITIES } from "./geo-block.server";

describe("blocked-city page", () => {
  it("is a 403 location notice, not a maintenance message", async () => {
    const res = blockedResponse();
    expect(res.status).toBe(403);
    const html = await res.text();
    expect(html).toContain("Not available from your location");
    expect(html).not.toMatch(/undergoing maintenance|Temporarily unavailable/i);
  });
  it("keeps Irvington, Ashburn and Council Bluffs blocked", () => {
    const labels = BLOCKED_CITIES.map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(["Irvington, NJ", "Ashburn, VA", "Council Bluffs, IA"]));
    expect(BLOCKED_CITIES).toHaveLength(9);
  });
});
