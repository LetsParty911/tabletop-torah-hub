import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.EXT_SUPABASE_URL;
  const serviceKey = process.env.EXT_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("EXT_SUPABASE_URL or EXT_SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSupabaseForUser(accessToken: string) {
  const url = process.env.EXT_SUPABASE_URL;
  const publishableKey = process.env.EXT_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("EXT_SUPABASE_URL or EXT_SUPABASE_PUBLISHABLE_KEY is not configured");
  }
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
