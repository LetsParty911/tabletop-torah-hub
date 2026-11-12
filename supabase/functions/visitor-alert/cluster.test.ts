import { describe, expect, it } from "vitest";
import { EXPECTED_USER_AGENT, isAutomationCluster, mayBeAutomationCluster } from "./cluster";

const record = {
  session_id: "d1888af0-6d41-4c19-a14d-e6a2e35bcbbc",
  asn: 13335,
  as_organization: "Cloudflare, Inc.",
  source_group: "Direct",
};
const view = {
  ip_address: "104.28.161.241",
  user_agent: EXPECTED_USER_AGENT,
  accept_language: "en-US,en;q=0.9",
  referrer_host: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  sec_ch_ua: null,
  sec_ch_platform: null,
  sec_ch_mobile: null,
};

describe("narrow automation alert grouping", () => {
  it("matches the observed Madrid/San Jose/Flower Mound pattern", () => {
    expect(mayBeAutomationCluster(record)).toBe(true);
    expect(isAutomationCluster(record, view)).toBe(true);
  });

  it("keeps normal Cloudflare and corporate-network visitors", () => {
    expect(isAutomationCluster({ ...record, as_organization: "B&H Foto & Electronics" }, view)).toBe(false);
    expect(isAutomationCluster({ ...record, asn: 0 }, view)).toBe(false);
    expect(isAutomationCluster(record, { ...view, user_agent: EXPECTED_USER_AGENT.replace("119.", "140.") })).toBe(false);
    expect(isAutomationCluster(record, { ...view, ip_address: "104.29.161.241" })).toBe(false);
    expect(isAutomationCluster(record, { ...view, ip_address: "104.28.999.241" })).toBe(false);
  });

  it("does not group campaign traffic, referrals or client-hint browsers", () => {
    expect(isAutomationCluster(record, { ...view, utm_source: "shul" })).toBe(false);
    expect(isAutomationCluster(record, { ...view, referrer_host: "example.org" })).toBe(false);
    expect(isAutomationCluster(record, { ...view, sec_ch_ua: '"Google Chrome";v="119"' })).toBe(false);
    expect(isAutomationCluster({ ...record, source_group: "WhatsApp" }, view)).toBe(false);
  });

  it("fails open for missing event evidence", () => {
    expect(isAutomationCluster(record, null)).toBe(false);
    expect(mayBeAutomationCluster({ ...record, session_id: null })).toBe(false);
  });
});
