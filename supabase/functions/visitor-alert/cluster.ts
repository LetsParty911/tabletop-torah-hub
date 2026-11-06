// Pure recognition of the narrow Cloudflare/Chrome-119 pattern observed in
// Torah For The Table analytics. This does NOT classify every Cloudflare user.
export const CLUSTER_KEY = "cloudflare-chrome119-10428-direct-v1";
export const EXPECTED_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";

export type AlertRow = {
  session_id?: string | null;
  asn?: string | number | null;
  as_organization?: string | null;
  source_group?: string | null;
};
export type PageViewRow = {
  ip_address?: string | null;
  user_agent?: string | null;
  accept_language?: string | null;
  referrer_host?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  sec_ch_ua?: string | null;
  sec_ch_platform?: string | null;
  sec_ch_mobile?: string | null;
};

const empty = (value: string | null | undefined) => !value || !value.trim();
function cloudflareIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const octets = ip.split(".");
  return octets.length === 4 && octets[0] === "104" && octets[1] === "28" &&
    octets.slice(2).every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** A fast gate before looking up first-party page-view data. */
export function mayBeAutomationCluster(record: AlertRow): boolean {
  return !!record.session_id &&
    Number(record.asn) === 13335 &&
    record.as_organization?.trim().toLowerCase() === "cloudflare, inc." &&
    record.source_group === "Direct";
}

/** Deliberately narrow: never suppress other ISPs, Cloudflare users, or campaigns. */
export function isAutomationCluster(record: AlertRow, view: PageViewRow | null): boolean {
  if (!view || !mayBeAutomationCluster(record)) return false;
  return cloudflareIp(view.ip_address) &&
    view.user_agent === EXPECTED_USER_AGENT &&
    view.accept_language === "en-US,en;q=0.9" &&
    empty(view.referrer_host) &&
    empty(view.utm_source) && empty(view.utm_medium) && empty(view.utm_campaign) &&
    empty(view.sec_ch_ua) && empty(view.sec_ch_platform) && empty(view.sec_ch_mobile);
}
