import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const mocks = vi.hoisted(() => ({ mode: vi.fn(), insert: vi.fn(), notification: vi.fn(), provider: vi.fn(), internal: vi.fn(), resolveGeo: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: () => { throw new Error("test inline background"); } }));
vi.mock("./internal-marker.server", () => ({ isInternalRequest: mocks.internal }));
vi.mock("@/integrations/supabase/ext.server", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => table === "vpn_block_settings"
      ? { select: () => ({ eq: () => ({ single: mocks.mode }) }) }
      : { insert: (...args: unknown[]) => {
        mocks.insert(...args);
        return { select: () => ({ single: async () => ({ data: { id: "test-audit" }, error: null }) }) };
      } },
  }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ insert: mocks.insert }) } }));
vi.mock("./vpn-notify.server", () => ({ workerEnv: () => undefined, recordProviderOutcome: mocks.provider, notifyBlocked: mocks.notification }));
vi.mock("./known-vpn-lists.server", () => ({ checkKnownNetwork: async () => ({ signal: null, status: "ok" }) }));
vi.mock("./ipapi-privacy.server", () => ({ getIpapiKey: () => null, checkIpapi: async () => ({ value: null, status: "not_configured", elapsed: 0 }) }));
vi.mock("./ip-geo.server", () => ({ resolveApproximateGeo: mocks.resolveGeo }));
import { checkVpnBlock, clearVpnModeCache } from "./vpn-block.server";
import { checkGeoBlock } from "./geo-block.server";
import { issueTrustedVpnToken, TRUSTED_VPN_COOKIE } from "./trusted-vpn-browser.server";
const secret = "gate-test-key-only";
let nextIp = 10;
function request(cookie = "", path = "/", ip = `203.0.113.${nextIp++}`) {
  return new Request(`https://torahforthetable.com${path}`, { headers: { accept: "text/html", cookie, "cf-connecting-ip": ip, "cf-ipcountry": "US", "user-agent": "Mozilla/5.0 test-browser" } });
}
beforeEach(() => {
  vi.stubEnv("TRUSTED_VPN_BROWSER_SECRET", secret);
  vi.clearAllMocks(); clearVpnModeCache(); mocks.internal.mockResolvedValue(false);
  mocks.mode.mockResolvedValue({ data: { mode: "block" }, error: null });
  mocks.insert.mockResolvedValue({ error: null });
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const ip = decodeURIComponent(new URL(input).pathname.split("/").pop() ?? "");
    return Response.json({ status: "ok", [ip]: { detections: { vpn: true, confidence: 99 }, location: { city_name: "Boston", region_name: "Massachusetts", country_code: "US" } } });
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("trusted cookie exempts only the existing VPN gate", () => {
  it("skips mode, provider, VPN audit and VPN alerts for trusted document and PDF requests", async () => {
    const cookie = `${TRUSTED_VPN_COOKIE}=${await issueTrustedVpnToken(secret)}`;
    for (const path of ["/", "/view/test-publication/pdf"]) expect(await checkVpnBlock(request(cookie, path))).toBeNull();
    expect(mocks.mode).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.notification).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("retains a normal 403 VPN block for non-enrolled visitors", async () => {
    const response = await checkVpnBlock(request());
    expect(response?.status).toBe(403); expect(fetch).toHaveBeenCalledOnce(); expect(mocks.notification).toHaveBeenCalledOnce();
  });
  it("retains a normal block for tampering, expiry and missing secret", async () => {
    const valid = await issueTrustedVpnToken(secret);
    const expired = await issueTrustedVpnToken(secret, Date.now() - 91 * 24 * 60 * 60 * 1000);
    for (const value of [valid + "x", expired]) expect((await checkVpnBlock(request(`${TRUSTED_VPN_COOKIE}=${value}`)))?.status).toBe(403);
    vi.stubEnv("TRUSTED_VPN_BROWSER_SECRET", "");
    expect((await checkVpnBlock(request(`${TRUSTED_VPN_COOKIE}=${valid}`)))?.status).toBe(403);
  });
  it("preserves existing internal-device bypass independently", async () => {
    mocks.internal.mockResolvedValue(true);
    expect(await checkVpnBlock(request("tftt_internal=test-marker"))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("trusted browser still gets exact-IP denial from the downstream geo gate", async () => {
    const cookie = `${TRUSTED_VPN_COOKIE}=${await issueTrustedVpnToken(secret)}`;
    const req = request(cookie, "/view/test-publication/pdf", "12.75.139.6");
    expect(await checkVpnBlock(req)).toBeNull();
    const response = await checkGeoBlock(req);
    expect(response?.status).toBe(403); expect(response?.headers.get("x-tftt-gate")).toBe("geo-block");
  });
  it("trusted browser still gets exact Fulton KY city denial", async () => {
    mocks.resolveGeo.mockResolvedValue({ city: "Fulton", region: "KY", country: "US", geoSource: "test", provider: "test" });
    const req = request(`${TRUSTED_VPN_COOKIE}=${await issueTrustedVpnToken(secret)}`);
    expect(await checkVpnBlock(req)).toBeNull();
    expect((await checkGeoBlock(req))?.status).toBe(403);
    expect(mocks.resolveGeo).toHaveBeenCalled();
  });
  it("admin and API paths remain reachable by non-enrolled VPN browsers", async () => {
    for (const path of ["/admin", "/api/trusted-vpn-browser"]) expect(await checkVpnBlock(request("", path))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});