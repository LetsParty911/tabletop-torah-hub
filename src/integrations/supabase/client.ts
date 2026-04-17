import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config.functions";

let cached: SupabaseClient | null = null;
let pending: Promise<SupabaseClient> | null = null;

export async function getSupabase(): Promise<SupabaseClient> {
  if (cached) return cached;
  if (pending) return pending;
  pending = (async () => {
    const { url, publishableKey } = await getSupabaseConfig();
    cached = createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
      },
    });
    return cached;
  })();
  return pending;
}
