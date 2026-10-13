// STAGED — NOT DEPLOYED. Entrypoint for a NEW external function `visitor-alert-two-stage`
// receiving webhooks from BOTH visitor_alert_queue (stage 1) and
// engaged_visitor_alert_queue (stage 2). Deploy only after owner approval (README).
// Secrets: VISITOR_ALERT_WEBHOOK_SECRET (new), existing PUSHOVER_APP_TOKEN / PUSHOVER_USER_KEY,
// optional VISITOR_ALERT_DRY_RUN=1. Ledger calls use the function's built-in service role.
import { handleTwoStage, type NotificationLedger } from "./two-stage.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`ledger ${fn} ${res.status}`);
  return res.json();
}
const ledger: NotificationLedger = {
  // A ledger outage throws -> 500 -> webhook retry; it never sends unclaimed.
  claim: async (sid, stage) => (await rpc("claim_visitor_notification", { p_session_id: sid, p_stage: stage })) === true,
  finish: async (sid, stage, status, detail) => {
    await rpc("finish_visitor_notification", { p_session_id: sid, p_stage: stage, p_status: status, p_detail: detail ?? null });
  },
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ code: "bad_payload" }), { status: 405 });
  let body: unknown = null;
  try { body = await req.json(); } catch { /* bad_payload */ }
  try {
    const r = await handleTwoStage(req.headers, body, {
      webhookSecret: Deno.env.get("VISITOR_ALERT_WEBHOOK_SECRET"),
      pushoverToken: Deno.env.get("PUSHOVER_APP_TOKEN"),
      pushoverUser: Deno.env.get("PUSHOVER_USER_KEY"),
      dryRun: Deno.env.get("VISITOR_ALERT_DRY_RUN") === "1",
    }, ledger, fetch);
    return new Response(JSON.stringify({ code: r.code, stage: r.stage, detail: r.detail }), { status: r.status, headers: { "content-type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ code: "ledger_unavailable" }), { status: 500 });
  }
});
