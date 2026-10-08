# Engaged-visitor Pushover alerts — staged fix (NOT DEPLOYED)

Status: staged only. Nothing here is applied to the external analytics project,
its triggers, webhooks, secrets, or the `visitor-alert` Edge Function. The
published site is unchanged. Rollout needs separate owner approval.

## Problem
`queue_visitor_alert()` queues the first `page_view` per session and the
`visitor-alert` function pushes "New visitor" unconditionally, so automated
loads (e.g. owner-identified Lovable test sessions
`e4a16974-…a4bd` Boydton and `58d7755d-…b371` Des Moines) trigger alerts.

## Design
- New trigger `queue_engaged_visitor_alert()` on `analytics_events` queues a
  session into `engaged_visitor_alert_queue` only on a deliberate action:
  publication_click, filter_change, search, pdf_open, download, share_click,
  signup, chooser_select, recommendation_click, my_table_add/open/remove.
- Never queued by: session_start, page_view, publication_impression, heartbeat,
  scroll_depth, human_signal, recommendation_view, outbound_click, error,
  server-side download_served.
- Excluded: `is_internal=true`; Lovable provenance (referrer host lovable.app /
  lovable.dev / lovableproject.com, UA containing "lovable", utm_source=lovable).
  No city, region, ASN, Microsoft or IP-range rules.
- `on conflict (session_id) do nothing` → at most one alert per session even for
  concurrent batches. Trigger errors are swallowed so ingest never breaks.
- Raw events and the old `visitor_alert_queue` stay intact for diagnostics.
- Function: shared-secret header `x-webhook-secret`, rejects wrong table
  (e.g. misrouted raw page_view payload from `visitor_alert_queue`), unknown
  events, missing session; dry-run via `VISITOR_ALERT_DRY_RUN=1`, `x-dry-run: 1`
  or `record.dry_run`. Result codes: sent, dry_run, not_configured,
  unauthorized, bad_payload, wrong_table, not_engaged, internal, push_failed.
- Message: "Visitor engaged: <reason>", with new/returning browser as
  secondary metadata and "not proof of a human".

## Rollout (manual, after approval)
### Verified current production pieces (external project)
- Trigger function: `public.queue_visitor_alert()` (AFTER INSERT on `analytics_events`)
- Raw queue table: `public.visitor_alert_queue`
- Database webhook: `visitor_alert_push` (INSERT on `visitor_alert_queue` →
  `visitor-alert`), sends an `Authorization: Bearer …` header
- Edge Function `visitor-alert`: `verify_jwt = true`
- Existing secrets: `PUSHOVER_APP_TOKEN` (app token), `PUSHOVER_USER_KEY` (user key).
  The staged function reads these exact names — **no renaming needed**.

### Steps
0. Save current state: `select pg_get_functiondef('public.queue_visitor_alert'::regproc);`,
   the deployed `visitor-alert` source, and the `visitor_alert_push` webhook config
   (headers redacted when copied anywhere).
1. Create one strong random value (password manager / `openssl rand -hex 32`) and
   store it only as function secret `VISITOR_ALERT_WEBHOOK_SECRET`. Never commit it
   or paste it into files/chat. Leave `PUSHOVER_APP_TOKEN` / `PUSHOVER_USER_KEY` as-is.
2. Set `VISITOR_ALERT_DRY_RUN=1`, then deploy `visitor-alert/` keeping
   `verify_jwt = true` (do not disable JWT verification).
   **Outage note:** from this moment the old `visitor_alert_push` webhook's payloads
   (table `visitor_alert_queue`, no `x-webhook-secret`) are rejected
   (`unauthorized` / `wrong_table`), so no Pushover alerts are sent until step 5
   ends dry-run. Brief, expected, intentional.
3. Run `migration.sql`.
4. Create the new webhook on `engaged_visitor_alert_queue` (INSERT) → `visitor-alert`.
   Keep the same `Authorization: Bearer …` header the current webhook uses (needed
   for `verify_jwt`), and add header `x-webhook-secret: <value from step 1>`, entered
   only in the webhook settings. Then disable/delete `visitor_alert_push`.
5. Trigger a real deliberate action on the live site from a non-internal device;
   confirm `dry_run` in function logs; then unset `VISITOR_ALERT_DRY_RUN`.

**What changes and what doesn't:** `queue_visitor_alert()` stays installed, so
`visitor_alert_queue` **keeps filling** with raw first page views. Only the old
*push notifications* stop, once `visitor_alert_push` is switched off.

## Rollback
Run `rollback.sql`, re-enable `visitor_alert_push` (with its original Bearer header),
and redeploy the saved original function.

## Tests
`src/lib/visitor-alert.test.ts` (Vitest, mocked fetch, no network, no database).
**Never test by inserting events into the live `analytics_events` table** — the
triggers would fire real queue rows and, after rollout, real Pushover alerts.
No city, region, ASN, Microsoft or IP-range rules exist anywhere in this fix.
