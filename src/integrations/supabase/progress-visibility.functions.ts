import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

async function requireProgressAdmin(accessToken: string | null) {
  if (!accessToken) throw new Error("Not authenticated");

  // Admins authenticate against the Lovable Cloud Supabase project. The
  // external Torah database uses a service-role client, so validate the
  // caller here before allowing a write.
  const { createClient } = await import("@supabase/supabase-js");
  const cloudUrl = process.env.SUPABASE_URL;
  const cloudKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!cloudUrl || !cloudKey) {
    throw new Error("Server misconfigured: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY missing");
  }

  const cloud = createClient(cloudUrl, cloudKey, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error } = await cloud.auth.getUser(accessToken);
  if (error || !userData?.user) throw new Error("Not authenticated");

  const email = (userData.user.email ?? "").toLowerCase();
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!email || !allowed.includes(email)) throw new Error("Forbidden");
}

export const getProgressVisibility = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ visible: boolean }> => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("settings")
      .select("progress_visible")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("getProgressVisibility error", error);
      // Safe rollout default: preserve the current behavior if the column is
      // temporarily unavailable while a deployment is propagating.
      return { visible: true };
    }

    return { visible: data?.progress_visible !== false };
  },
);

export const adminSetProgressVisibility = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string; visible: boolean }) =>
    z
      .object({
        accessToken: z.string().min(10),
        visible: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireProgressAdmin(data.accessToken);

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("settings")
      .update({
        progress_visible: data.visible,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) throw new Error(error.message);
    return { ok: true, visible: data.visible };
  });
