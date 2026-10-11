// STAGED — NOT DEPLOYED. Replacement entrypoint for the external
// `visitor-alert` Edge Function. Bundle this entrypoint (see ../README.md),
// then deploy only that artifact after owner approval.
// Secrets read: VISITOR_ALERT_WEBHOOK_SECRET (new), plus the EXISTING
// PUSHOVER_APP_TOKEN and PUSHOVER_USER_KEY (no renaming), optional VISITOR_ALERT_DRY_RUN=1.
import { handleAlert } from "./core";
import { createSessionLoader } from "./session-loader";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ code: "bad_payload" }), { status: 405 });
  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled as bad_payload */ }
  const result = await handleAlert(req.headers, body, {
    webhookSecret: Deno.env.get("VISITOR_ALERT_WEBHOOK_SECRET"),
    pushoverToken: Deno.env.get("PUSHOVER_APP_TOKEN"),
    pushoverUser: Deno.env.get("PUSHOVER_USER_KEY"),
    dryRun: Deno.env.get("VISITOR_ALERT_DRY_RUN") === "1",
  }, fetch, createSessionLoader(
    Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), fetch,
  ));
  // Never echo secrets; return only the result code and non-sensitive detail.
  return new Response(JSON.stringify({ code: result.code, detail: result.detail }), {
    status: result.status,
    headers: { "content-type": "application/json" },
  });
});
