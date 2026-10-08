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
0. Save current source: `select pg_get_functiondef('public.queue_visitor_alert'::regproc);`,
   the current `visitor-alert` function code, and the webhook config.
1. Generate a random secret; add `VISITOR_ALERT_WEBHOOK_SECRET` to the external
   project's function secrets. Confirm Pushover secret names match `index.ts`.
2. Deploy `visitor-alert/` with `VISITOR_ALERT_DRY_RUN=1`.
3. Run `migration.sql`.
4. Change the database webhook: table `engaged_visitor_alert_queue`, INSERT,
   header `x-webhook-secret: <secret>`. Remove the old visitor_alert_queue webhook.
5. Click a PDF on the site from a non-internal device; check function logs for
   `dry_run`. Then unset `VISITOR_ALERT_DRY_RUN` to go live.

## Rollback
Run `rollback.sql`, restore the old webhook and redeploy the saved function.

## Tests
`src/lib/visitor-alert.test.ts` (Vitest, mock fetch, no network).
