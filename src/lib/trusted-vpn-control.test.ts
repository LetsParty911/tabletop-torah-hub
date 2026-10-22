import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const auth = vi.hoisted(() => vi.fn());
vi.mock("./admin-auth.server", () => ({ verifyAdminAccessToken: auth }));
import { trustedVpnControl } from "./trusted-vpn-control.server";
import { TRUSTED_VPN_COOKIE, verifyTrustedVpnToken } from "./trusted-vpn-browser.server";
const secret = "test-control-key-not-production";
const url = "https://torahforthetable.com/api/trusted-vpn-browser";
const post = (body: object, origin: string | null = "https://torahforthetable.com") => new Request(url, {
  method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.stubEnv("TRUSTED_VPN_BROWSER_SECRET", secret);
  auth.mockReset().mockImplementation(async token => { if (token !== "test-admin-token") throw new Error(token === "test-nonadmin-token" ? "Forbidden" : "Not authenticated"); return "test-admin"; });
});
afterEach(() => vi.unstubAllEnvs());

describe("admin-only browser enrollment and revocation", () => {
  it("rejects unauthenticated and non-admin enable AND revoke without a cookie", async () => {
    for (const action of ["enable", "revoke"]) for (const [accessToken, status] of [["", 401], ["test-nonadmin-token", 403]] as const) {
      const response = await trustedVpnControl(post({ action, accessToken }));
      expect(response.status).toBe(status);
      expect(response.headers.has("set-cookie")).toBe(false);
    }
  });
  it("rejects missing or cross-origin POST before authentication", async () => {
    for (const origin of [null, "https://attacker.test", "http://torahforthetable.com"]) {
      expect((await trustedVpnControl(post({ action: "enable", accessToken: "test-admin-token" }, origin))).status).toBe(403);
    }
    expect(auth).not.toHaveBeenCalled();
  });
  it("rejects cross-site fetch metadata even with a matching origin", async () => {
    const request = post({ action: "enable", accessToken: "test-admin-token" });
    request.headers.set("sec-fetch-site", "cross-site");
    expect((await trustedVpnControl(request)).status).toBe(403);
    expect(auth).not.toHaveBeenCalled();
  });
  it("issues a verifiable cookie only for an authenticated admin; status reads it back", async () => {
    const response = await trustedVpnControl(post({ action: "enable", accessToken: "test-admin-token" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const cookie = response.headers.get("set-cookie") ?? "";
    const value = cookie.split(";")[0].slice(TRUSTED_VPN_COOKIE.length + 1);
    expect(await verifyTrustedVpnToken(value, secret)).not.toBeNull();
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["expiresAt", "trusted"]);
    expect(body).toMatchObject({ trusted: true });
    const state = await trustedVpnControl(new Request(url, { headers: { authorization: "Bearer test-admin-token", cookie } }));
    expect(await state.json()).toMatchObject({ trusted: true, available: true });
  });
  it("revokes this browser with verified admin auth even if signing key is unavailable", async () => {
    vi.stubEnv("TRUSTED_VPN_BROWSER_SECRET", "");
    const response = await trustedVpnControl(post({ action: "revoke", accessToken: "test-admin-token" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(`${TRUSTED_VPN_COOKIE}=;`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("fails closed for missing signing secret and does not expose capability in JSON", async () => {
    vi.stubEnv("TRUSTED_VPN_BROWSER_SECRET", "");
    const response = await trustedVpnControl(post({ action: "enable", accessToken: "test-admin-token" }));
    expect(response.status).toBe(503);
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it("requires admin authentication for status and rejects invalid actions", async () => {
    expect((await trustedVpnControl(new Request(url))).status).toBe(401);
    expect((await trustedVpnControl(post({ action: "bogus", accessToken: "test-admin-token" }))).status).toBe(400);
  });
});