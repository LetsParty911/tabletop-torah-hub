import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public: whether the public site should show the maintenance page.
export const getMaintenanceStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ enabled: boolean }> => {
    const { readMaintenanceEnabled } = await import("./maintenance.server");
    return { enabled: await readMaintenanceEnabled() };
  },
);

export const adminGetMaintenance = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { verifyAdminAccessToken } = await import("./admin-auth.server");
    await verifyAdminAccessToken(data.accessToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("site_maintenance")
      .select("enabled, updated_at, updated_by")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      enabled: row ? row.enabled : true,
      updatedAt: row?.updated_at ?? null,
      updatedBy: row?.updated_by ?? null,
    };
  });

export const adminSetMaintenance = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; enabled: boolean; confirm: string }) =>
    z
      .object({
        accessToken: z.string().min(10),
        enabled: z.boolean(),
        confirm: z.literal("CHANGE_MAINTENANCE_MODE"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { verifyAdminAccessToken } = await import("./admin-auth.server");
    const email = await verifyAdminAccessToken(data.accessToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("site_maintenance")
      .upsert({ id: 1, enabled: data.enabled, updated_at: updatedAt, updated_by: email });
    if (error) throw new Error(error.message);
    const { rememberMaintenanceValue } = await import("./maintenance.server");
    rememberMaintenanceValue(data.enabled);
    return { enabled: data.enabled, updatedAt, updatedBy: email };
  });
