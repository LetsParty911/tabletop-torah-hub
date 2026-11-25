import { describe, expect, it } from "vitest";
import { checkCountryBlock } from "./country-block.server";

describe("exact edge country policy", () => {
  it.each(["IN", "PK", "BD", "VN", "CN"])("denies %s", (country) => {
    expect(checkCountryBlock(new Request("https://example.test/", {
      headers: { "cf-ipcountry": country },
    }))?.status).toBe(403);
  });

  it.each(["US", "GB", "TW", "HK", "MO", "CA", "", "XX", "T1", "in", "cn", "IND", "IN,US", " IN", "IN ", "ZZ"])("allows unknown/unlisted exact input %j", (country) => {
    // Headers normalizes HTTP whitespace, so retain the raw getter here to test
    // that this gate itself never trims/uppercases malformed hosting input.
    const request = new Request("https://example.test/");
    Object.defineProperty(request.headers, "get", { value: (key: string) => key === "cf-ipcountry" ? country : null });
    expect(checkCountryBlock(request)).toBeNull();
  });

  it("ignores claimed location, body, cookies and Vercel overrides", () => {
    const request = new Request("https://example.test/admin?country=US", {
      method: "POST",
      headers: {
        "cf-ipcountry": "IN", "x-vercel-ip-country": "US",
        "cookie": "tftt_internal=anything; tftt_trusted_vpn=anything",
        "authorization": "Bearer forged-admin", "user-agent": "Owner device",
      },
      body: JSON.stringify({ country: "US", admin: true }),
    });
    expect(checkCountryBlock(request)?.status).toBe(403);
    expect(request.bodyUsed).toBe(false);
    expect(checkCountryBlock(new Request("https://example.test/?country=CN", {
      headers: { "x-vercel-ip-country": "CN" },
    }))).toBeNull();
    expect(checkCountryBlock(new Request("https://example.test/", {
      headers: { "cf-ipcountry": "US", "x-vercel-ip-country": "CN" },
    }))).toBeNull();
  });

  it.each(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("denies %s with non-cacheable, safe response", async (method) => {
    const response = checkCountryBlock(new Request("https://example.test/", {
      method, headers: { "cf-ipcountry": "PK", accept: "text/html" },
    }));
    expect(response?.status).toBe(403);
    expect(response?.headers.get("cache-control")).toContain("no-store");
    expect(response?.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    expect(response?.headers.get("x-content-type-options")).toBe("nosniff");
    if (method === "HEAD") expect(await response?.text()).toBe("");
  });

  it.each(["/api/signup", "/api", "/_serverFn", "/_serverFn/action"])("returns JSON for %s", async (path) => {
    const response = checkCountryBlock(new Request(`https://example.test${path}`, {
      headers: { "cf-ipcountry": "BD", accept: "text/html" },
    }));
    expect(response?.headers.get("content-type")).toContain("application/json");
    expect(await response?.json()).toEqual({ error: "Access unavailable" });
  });

  it.each(["/view/id/pdf", "/view/id/download", "/view/id/print", "/assets/book.pdf"])("never serves an HTML/PDF impostor for %s", (path) => {
    expect(checkCountryBlock(new Request(`https://example.test${path}`, {
      headers: { "cf-ipcountry": "VN", accept: "text/html,application/pdf" },
    }))?.headers.get("content-type")).toContain("text/plain");
  });
});

describe("early Henrico abuse IP denial", () => {
  it.each(["47.253.4.207", "47.253.152.120"] )("denies %s on pages and APIs", (ip) => {
    for (const path of ["/", "/api/events", "/_serverFn/action", "/admin"]) {
      for (const method of ["GET", "HEAD", "POST"]) {
        const result = checkCountryBlock(new Request("https://example.test" + path, {
          method, headers: { "cf-connecting-ip": ip, "cf-ipcountry": "US" },
        }));
        expect(result?.status).toBe(403);
        expect(result?.headers.get("cache-control")).toContain("no-store");
      }
    }
  });
  it("allows nearby addresses and ignores untrusted forwarded IP claims", () => {
    expect(checkCountryBlock(new Request("https://example.test/", { headers: {
      "cf-connecting-ip": "47.253.4.208", "cf-ipcountry": "US", "x-forwarded-for": "47.253.4.207",
    } }))).toBeNull();
  });
});
