import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const filterSchema = z.object({
  accessToken: z.string().min(10),
  days: z.number().int().min(1).max(90).default(7),
  page: z.number().int().min(0).max(1000).default(0),
  verdict: z.enum(["all", "clean", "detected", "unknown", "skipped", "blocked"]).default("all"),
  ip: z.string().max(45).optional(),
});
export const adminVpnTracking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => filterSchema.parse(input))
  .handler(async ({ data }) => {
    const { verifyAdminAccessToken } = await import("./admin-auth.server");
    await verifyAdminAccessToken(data.accessToken);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
    const admin = getSupabaseAdmin();
    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    let q = admin.from("vpn_connection_checks")
      .select("id,created_at,ip_address,country,region,city,vpn_operator,user_agent,referrer_host,request_path,utm_source,mode,decision,verdict,signals,confidence,lookup_source,provider_status,lookup_ms,error_code,is_automated,detected_by,provider_results",{count:"exact"})
      .gte("created_at", since);
    if (data.verdict === "blocked") q=q.eq("decision","blocked");
    else if (data.verdict !== "all") q=q.eq("verdict",data.verdict);
    if (data.ip) q=q.eq("ip_address",data.ip);
    const start = data.page * 100;
    const [{data: rows, count, error}, summary] = await Promise.all([
      q.order("created_at",{ascending:false}).range(start,start+99),
      admin.rpc("vpn_connection_summary",{p_since:since}),
    ]);
    if (error) throw new Error(error.message);
    if (summary.error) throw new Error(summary.error.message);
    const [security, evidence] = await Promise.all([loadSecurityStats(admin, since), loadReaderEvidence(admin, rows ?? [])]);
    return {rows:(rows??[]).map((r: {id:string}, i: number)=>({...r, evidence: evidence[i]})),count:count??0,summary:summary.data??{},page:data.page,days:data.days,security};
  });

// Read-only, single batched (paginated, capped) query for behaviour evidence on the visible page.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadReaderEvidence(admin: any, rows: Array<{created_at:string;ip_address:string|null;user_agent:string|null;is_automated:boolean}>) {
  const { classifyReaderEvidence, POSITIVE_EVENTS, EVIDENCE_WINDOW_MS } = await import("./vpn-reader-evidence");
  type Ev = import("./vpn-reader-evidence").EvidenceEvent;
  const ips = [...new Set(rows.map(r=>r.ip_address?.trim()).filter((x): x is string => !!x))];
  let events: Ev[] | null = [], err: string | null = null;
  if (ips.length) {
    const times = rows.map(r=>Date.parse(r.created_at)).filter(Number.isFinite);
    const from = new Date(Math.min(...times) - EVIDENCE_WINDOW_MS).toISOString();
    const to = new Date(Math.max(...times) + EVIDENCE_WINDOW_MS).toISOString();
    const PAGE = 1000, CAP = 5000;
    try {
      for (let off = 0; off < CAP; off += PAGE) {
        const { data, error } = await admin.from("analytics_events")
          .select("event_name,occurred_at,ip_address,user_agent,is_internal,referrer_host")
          .in("ip_address", ips).in("event_name", POSITIVE_EVENTS as string[])
          .gte("occurred_at", from).lte("occurred_at", to)
          .order("occurred_at", { ascending: true }).range(off, off + PAGE - 1);
        if (error) { err = "analytics read error"; console.error("vpn evidence read failed", error.message); events = null; break; }
        events!.push(...((data ?? []) as Ev[]));
        if ((data ?? []).length < PAGE) break;
        if (off + PAGE >= CAP) err = null; // capped: matches found are still real; absence is reported as unverified
      }
    } catch (e) { err = "analytics read error"; events = null; console.error("vpn evidence read threw", e instanceof Error ? e.message : e); }
  }
  return rows.map(r => classifyReaderEvidence(r, events, err));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSecurityStats(admin: any, since: string) {
  const [checks, notes, fails] = await Promise.all([
    admin.from("vpn_connection_checks").select("decision,detected_by,provider_results").gte("created_at", since)
      .or("decision.eq.blocked,verdict.eq.unknown").order("created_at",{ascending:false}).limit(5000),
    admin.from("vpn_security_notifications").select("created_at,kind,provider,status,attempts,location,last_error_category,sent_at")
      .gte("created_at", since).order("created_at",{ascending:false}).limit(1000),
    (async()=>{ const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return supabaseAdmin.from("vpn_audit_failures").select("created_at,error_category,decision,ip_address,city,region,country,detected_by")
        .gte("created_at", since).order("created_at",{ascending:false}).limit(50); })(),
  ]);
  if (checks.error) throw new Error(checks.error.message);
  if (notes.error) throw new Error(notes.error.message);
  const providers: Record<string,{detected:number;errors:number;quota:number;credentials:number}> = {};
  let blocked=0, multi=0, unattributed=0;
  for (const r of checks.data ?? []) {
    const by: string[] = r.detected_by ?? [];
    if (r.decision === "blocked") { blocked++; if (by.length>1) multi++; if (!by.length) unattributed++; }
    for (const name of by) (providers[name] ??= {detected:0,errors:0,quota:0,credentials:0}).detected++;
    for (const [name,res] of Object.entries((r.provider_results ?? {}) as Record<string,{ok?:boolean;failure?:string|null}>)) {
      if (res && res.ok === false) { const p = (providers[name] ??= {detected:0,errors:0,quota:0,credentials:0}); p.errors++; if (res.failure==="quota") p.quota++; if (res.failure==="credentials") p.credentials++; }
    }
  }
  const n = notes.data ?? [];
  const count = (k:string,s?:string)=>n.filter((x:{kind:string;status:string})=>x.kind===k&&(!s||x.status===s)).length;
  return {
    sampled: (checks.data ?? []).length, blocked, multi, unattributed, providers,
    notifications: {
      blockSent: count("vpn_blocked","sent"), blockFailed: count("vpn_blocked","failed"), blockPending: count("vpn_blocked","sending")+count("vpn_blocked","queued"),
      failureSent: count("provider_failure","sent"), failureFailed: count("provider_failure","failed"), failurePending: count("provider_failure","sending")+count("provider_failure","queued"),
      recent: n.slice(0,25),
    },
    auditFailures: fails.error ? [] : (fails.data ?? []),
    auditFailuresError: fails.error ? fails.error.message : null,
  };
}

export const adminRetryVpnNotifications = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ accessToken: z.string().min(10) }).parse(input))
  .handler(async ({ data }) => {
    const { verifyAdminAccessToken } = await import("./admin-auth.server");
    await verifyAdminAccessToken(data.accessToken);
    const { retryFailedNotifications } = await import("./vpn-notify.server");
    return retryFailedNotifications(undefined);
  });

export const adminTestVpnPushover = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ accessToken: z.string().min(10) }).parse(input))
  .handler(async ({ data }) => {
    const { verifyAdminAccessToken } = await import("./admin-auth.server");
    await verifyAdminAccessToken(data.accessToken);
    const { sendPushover } = await import("./vpn-notify.server");
    return sendPushover(undefined, "TFTT — VPN alert test", "Test message from the admin VPN dashboard. If you see this, VPN alerts can reach you.");
  });
