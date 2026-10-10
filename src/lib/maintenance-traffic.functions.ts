import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const adminMaintenanceTraffic = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; from: string; to: string }) =>
    z.object({ accessToken: z.string().min(10), from: ymd, to: ymd }).parse(input),
  )
  .handler(async ({ data }) => {
    const { verifyAdminAccessToken } = await import("./admin-auth.server");
    await verifyAdminAccessToken(data.accessToken);
    const { nyMidnightUtc, summarizeMaintenanceVisits, formatNy, locationLabel } = await import("./maintenance-traffic");
    const start = nyMidnightUtc(data.from);
    const endDay = new Date(nyMidnightUtc(data.to).getTime() + 36 * 3600_000).toISOString().slice(0, 10);
    const end = nyMidnightUtc(endDay); // midnight NY after "to"
    if (end.getTime() <= start.getTime()) throw new Error("Invalid date range");
    if (end.getTime() - start.getTime() > 93 * 86400_000) throw new Error("Range too long (max 92 days)");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("maintenance_visits")
      .select("created_at, path, country, region, city, device, referrer_domain, classification, visitor_key")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    return {
      rangeStartNy: formatNy(start.toISOString()),
      rangeEndNy: formatNy(end.toISOString()),
      truncated: list.length >= 5000,
      summary: summarizeMaintenanceVisits(list),
      recent: list.slice(0, 50).map((r) => ({
        timeNy: formatNy(r.created_at), path: r.path, location: locationLabel(r),
        device: r.device, referrer: r.referrer_domain, classification: r.classification,
      })),
    };
  });
