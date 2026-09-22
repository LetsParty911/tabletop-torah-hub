// Shared admin verification for server routes.
//
// Mirrors the check used by the analytics server functions: the Supabase access
// token must belong to a signed-in user whose email is in ADMIN_EMAILS.
// Server-only: never imported by client code.

export async function verifyAdminAccessToken(accessToken: string): Promise<string> {
  if (!accessToken || accessToken.length < 10) throw new Error("Not authenticated");

  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Server misconfigured: Supabase credentials missing");

  const cloud = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await cloud.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Not authenticated");

  const email = (data.user.email ?? "").toLowerCase();
  const allow = (process.env["ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!email || !allow.includes(email)) throw new Error("Forbidden");
  return email;
}
