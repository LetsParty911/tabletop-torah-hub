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
    const [{data: rows, count, error}, summary, providerSummary] = await Promise.all([
      q.order("created_at",{ascending:false}).range(start,start+99),
      admin.rpc("vpn_connection_summary",{p_since:since}),
      admin.rpc("vpn_provider_summary",{p_since:since}),
    ]);
    if (error) throw new Error(error.message);
    if (summary.error) throw new Error(summary.error.message);
    if (providerSummary.error) throw new Error(providerSummary.error.message);
    return {rows:rows??[],count:count??0,summary:summary.data??{},providers:providerSummary.data??{},page:data.page,days:data.days};
  });
