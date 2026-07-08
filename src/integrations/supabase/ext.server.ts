// Server-only Supabase helpers pointing at the external "torah-by-the-table" project.
// The .server.ts extension keeps this out of client bundles.
// Falls back to Cloud env vars when EXT_* vars are absent.
import { createClient } from "@supabase/supabase-js";

const EXT_URL = process.env.EXT_SUPABASE_URL || process.env.SUPABASE_URL;
const EXT_SERVICE_KEY =
  process.env.EXT_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXT_PUBLISHABLE_KEY =
  process.env.EXT_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

function assertEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

// Admin client (service role) — bypasses RLS. Server-only.
// Typed as `any` intentionally so callers work without generated types
// for the external project's schema.
export function getSupabaseAdmin(): any {
  const url = assertEnv("EXT_SUPABASE_URL", EXT_URL);
  const key = assertEnv("EXT_SUPABASE_SERVICE_ROLE_KEY", EXT_SERVICE_KEY);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

// Per-user client using the request's access token — RLS enforced as that user.
export function getSupabaseForUser(accessToken: string): any {
  const url = assertEnv("EXT_SUPABASE_URL", EXT_URL);
  const key = assertEnv("EXT_SUPABASE_PUBLISHABLE_KEY", EXT_PUBLISHABLE_KEY);
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}
