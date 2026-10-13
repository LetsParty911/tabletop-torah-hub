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
    const security = await loadSecurityStats(admin, since);
    return {rows:rows??[],count:count??0,summary:summary.data??{},page:data.page,days:data.days,security};
  });

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
