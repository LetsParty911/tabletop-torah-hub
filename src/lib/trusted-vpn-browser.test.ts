import { describe, it, expect, afterEach, vi } from "vitest";
import { issueTrustedVpnToken, verifyTrustedVpnToken, trustedVpnSecret, trustedVpnCookieHeader, trustedVpnCookieValue, isTrustedVpnBrowser, TRUSTED_VPN_COOKIE, TRUSTED_VPN_MAX_AGE } from "./trusted-vpn-browser.server";
import { isInternalRequest } from "./internal-marker.server";

const secret = "unit-test-only-not-a-real-signing-key";
const now = Date.UTC(2026, 9, 22, 16, 21);
afterEach(() => vi.unstubAllEnvs());

describe("independent trusted VPN browser capability", () => {
  it("issues unique per-browser nonces and accepts a signed 90-day token", async () => {
    const a = await issueTrustedVpnToken(secret, now), b = await issueTrustedVpnToken(secret, now);
    expect(a).not.toBe(b);
    expect(await verifyTrustedVpnToken(a, secret, now)).toBe(now + 90 * 24 * 60 * 60 * 1000);
    expect(TRUSTED_VPN_MAX_AGE).toBe(7_776_000);
  });
  it("rejects tampered nonce, signature, expiry, version and wrong key", async () => {
    const value = await issueTrustedVpnToken(secret, now);
    const parts = value.split(".");
    for (const index of [0, 1, 2, 3, 4]) {
      const changed = [...parts];
      changed[index] = index === 0 ? "v2" : (parts[index][0] === "a" ? "b" : "a") + parts[index].slice(1);
      expect(await verifyTrustedVpnToken(changed.join("."), secret, now)).toBeNull();
    }
    expect(await verifyTrustedVpnToken(value, "different-test-key", now)).toBeNull();
  });
  it("expires exactly at 90 days and rejects future issuance", async () => {
    const value = await issueTrustedVpnToken(secret, now);
    expect(await verifyTrustedVpnToken(value, secret, now + TRUSTED_VPN_MAX_AGE * 1000 - 1)).not.toBeNull();
    expect(await verifyTrustedVpnToken(value, secret, now + TRUSTED_VPN_MAX_AGE * 1000)).toBeNull();
    expect(await verifyTrustedVpnToken(value, secret, now - 1000)).toBeNull();
  });
  it("fails closed for missing secret, missing, malformed or duplicated cookies", async () => {
    const value = await issueTrustedVpnToken(secret, now);
    expect(await verifyTrustedVpnToken(value, null, now)).toBeNull();
    await expect(issueTrustedVpnToken(null, now)).rejects.toThrow("signing secret missing");
    for (const input of [null, "", "%E0%A4%A", "v1.short", "a".repeat(300)]) {
      expect(await verifyTrustedVpnToken(input, secret, now)).toBeNull();
    }
    expect(trustedVpnCookieValue(new Request("https://example.test", { headers: { cookie: `${TRUSTED_VPN_COOKIE}=one; ${TRUSTED_VPN_COOKIE}=two` } }))).toBeNull();
  });
  it("prefers authoritative Worker bindings and fails closed when that binding is missing", async () => {
    vi.stubEnv("TRUSTED_VPN_BROWSER_SECRET", "node-test-key");
    const request = new Request("https://example.test");
    Object.assign(request, { runtime: { cloudflare: { env: { TRUSTED_VPN_BROWSER_SECRET: secret } } } });
    expect(await trustedVpnSecret(request)).toBe(secret);
    Object.assign(request, { runtime: { cloudflare: { env: {} } } });
    expect(await trustedVpnSecret(request)).toBeNull();
    expect(await trustedVpnSecret(new Request("https://example.test"))).toBe("node-test-key");
  });
  it("uses only its independent cookie and never marks analytics internal", async () => {
    vi.stubEnv("TRUSTED_VPN_BROWSER_SECRET", secret);
    const value = await issueTrustedVpnToken(secret);
    const request = new Request("https://example.test", { headers: { cookie: `${TRUSTED_VPN_COOKIE}=${value}` } });
    expect(await isTrustedVpnBrowser(request)).toBe(true);
    expect(await isInternalRequest(request)).toBe(false);
    expect(await isTrustedVpnBrowser(new Request("https://example.test", { headers: { cookie: "tftt_internal=pretend" } }))).toBe(false);
  });
  it("sets a host-only HttpOnly Lax HTTPS cookie and clears the same cookie", () => {
    const https = new Request("https://torahforthetable.com");
    const cookie = trustedVpnCookieHeader(https, "test-token");
    expect(cookie).toContain("HttpOnly; SameSite=Lax");
    expect(cookie).toContain("; Secure");
    expect(cookie).toContain("Max-Age=7776000");
    expect(cookie).not.toContain("Domain=");
    expect(trustedVpnCookieHeader(https, null)).toContain("Max-Age=0; Secure");
    expect(trustedVpnCookieHeader(new Request("http://localhost:8080"), "test-token")).not.toContain("Secure");
  });
});