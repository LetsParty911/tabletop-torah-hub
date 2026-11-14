import { describe, expect, it } from "vitest";
import { isSupabaseQuotaRestricted } from "./supabase-quota";

describe("quota restriction detection", () => {
  it("detects the Supabase HTTP 402 rejection", () => {
    expect(isSupabaseQuotaRestricted({ status: 402, message: "Payment Required" })).toBe(true);
    expect(isSupabaseQuotaRestricted({ message: "Service for this project is restricted due to exceed_egress_quota" })).toBe(true);
    expect(isSupabaseQuotaRestricted(new Error("402: service for this project is restricted"))).toBe(true);
  });

  it("does not mistake schema errors or temporary errors for billing restrictions", () => {
    expect(isSupabaseQuotaRestricted({ code: "42703", message: "column does not exist" })).toBe(false);
    expect(isSupabaseQuotaRestricted({ status: 503, message: "temporarily unavailable" })).toBe(false);
    expect(isSupabaseQuotaRestricted(null)).toBe(false);
  });
});
