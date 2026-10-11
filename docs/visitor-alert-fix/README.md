# Engaged-visitor Pushover alerts — staged fix (NOT DEPLOYED)

Status: staged only. The shadow engaged-visitor queue is safe to install separately;
no new outbound webhook or Pushover function is enabled by this migration.
The original `visitor-alert` function and raw `visitor_alert_push` webhook remain untouched.
A separate owner-approved notification cutover is still required.

## Problem
`queue_visitor_alert()` queues the first `page_view` per session and the
`visitor-alert` function pushes "New visitor" unconditionally, so automated
loads (e.g. owner-identified Lovable test sessions
`e4a16974-…a4bd` Boydton and `58d7755d-…b371` Des Moines) trigger alerts.

## Design
- New trigger `queue_engaged_visitor_alert()` on `analytics_events` queues a
  session into `engaged_visitor_alert_queue` only on a deliberate action:
  publication_click, filter_change, search, download, share_click,
  signup, chooser_select, recommendation_click, my_table_add/open/remove.
- Never queued by: session_start, page_view, publication_impression, pdf_open (automatic preview), heartbeat,
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

## Safe two-stage rollout

### Stage A — shadow observation (no Pushover changes)
1. Review and apply `migration.sql` to the external analytics project.
   This creates the engaged queue with RLS and a narrowly allowed trigger.
   The trigger writes to a private table, never calls HTTP, and cannot send alerts.
2. Observe newly arriving, authentic reader actions by comparing
   `engaged_visitor_alert_queue` with existing first-page-view queue.
   Do not insert synthetic analytics events into production.
3. Leave the original `visitor_alert_push` webhook and `visitor-alert`
   function in operation. Do not add an outbound webhook yet.
4. To undo Stage A, run `rollback.sql`, preserving collected queue rows.

### Stage B — separate cutover (NOT APPROVED BY STAGE A)
1. Deploy the new handler under a *different* function name,
   `visitor-alert-engaged`, not on top of the existing `visitor-alert`.
   Keep `verify_jwt=true`.
2. Configure a new `VISITOR_ALERT_WEBHOOK_SECRET` securely in Edge Function
   secrets and its webhook; never commit or display the value. Reuse existing
   Pushover secrets only on the new function.
3. Start with `VISITOR_ALERT_DRY_RUN=1`, and configure a new webhook on
   `engaged_visitor_alert_queue` pointing to the parallel function.
4. Validate real future qualified actions and dry-run logs. Then switch off
   the old push webhook and turn off dry-run under a coordinated cutover.
   Disable the old webhook *before* enabling live delivery on the new one,
   avoiding duplicate notifications.
5. Roll back by restoring the old webhook and disabling the new one.

**Important:** Stage A is additive. The new queue only records events,
does not identify people, and automatic `pdf_open` preview events are
excluded. Stage B requires its own deployment verification.

## Tests
`src/lib/visitor-alert.test.ts` (Vitest, mocked fetch, no network, no database).
**Never test by inserting events into the live `analytics_events` table** — the
triggers would fire real queue rows and, after rollout, real Pushover alerts.
No city, region, ASN, Microsoft or IP-range rules exist anywhere in this fix.
