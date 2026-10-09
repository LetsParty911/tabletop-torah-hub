// Canonical evidence only; never invoke a function or insert live test rows.
import type { AlertSessionRow } from "../../../src/lib/visitor-alert-classifier";
import type { SessionLoader } from "./core";

export function createSessionLoader(url: string | undefined, key: string | undefined, fetchImpl: typeof fetch): SessionLoader {
  return async (sessionId) => {
    if (!url || !key) return null;
    const rows: AlertSessionRow[] = [];
    const size = 1000;
    // Bounded, paginated read. Oversized or failed reads remain unverified.
    for (let offset = 0; offset < 10_000; offset += size) {
      const query = new URL(`${url}/rest/v1/analytics_events`);
      query.searchParams.set("session_id", `eq.${sessionId}`);
      query.searchParams.set("select", "event_id,event_name,occurred_at,visitor_id,session_id,metadata,device_type,source_group,referrer_host,user_agent,is_internal,utm_source,as_organization");
      query.searchParams.set("order", "id.asc");
      query.searchParams.set("offset", String(offset));
      query.searchParams.set("limit", String(size));
      const response = await fetchImpl(query, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      const page: unknown = await response.json();
      if (!Array.isArray(page) || page.some((row) => !row ||
        typeof row !== "object" || row.session_id !== sessionId ||
        typeof row.event_name !== "string" || typeof row.occurred_at !== "string")) return null;
      rows.push(...page as AlertSessionRow[]);
      if (page.length < size) return rows;
    }
    return null;
  };
}
