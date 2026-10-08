// STAGED — NOT DEPLOYED. Replacement entrypoint for the external
// `visitor-alert` Edge Function. Copy this folder into the external project's
// supabase/functions/visitor-alert/ only after owner approval (see ../README.md).
// Secrets read: VISITOR_ALERT_WEBHOOK_SECRET (new), PUSHOVER_TOKEN, PUSHOVER_USER
// (rename to match the existing function's secret names), optional VISITOR_ALERT_DRY_RUN=1.
import { handleAlert } from "./core.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ code: "bad_payload" }), { status: 405 });
  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled as bad_payload */ }
  const result = await handleAlert(req.headers, body, {
    webhookSecret: Deno.env.get("VISITOR_ALERT_WEBHOOK_SECRET"),
    pushoverToken: Deno.env.get("PUSHOVER_TOKEN"),
    pushoverUser: Deno.env.get("PUSHOVER_USER"),
    dryRun: Deno.env.get("VISITOR_ALERT_DRY_RUN") === "1",
  }, fetch);
  // Never echo secrets; return only the result code and non-sensitive detail.
  return new Response(JSON.stringify({ code: result.code, detail: result.detail }), {
    status: result.status,
    headers: { "content-type": "application/json" },
  });
});
