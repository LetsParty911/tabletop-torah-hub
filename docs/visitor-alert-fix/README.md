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
- SQL queues **candidates**, not verified humans. Eligible actions: tagged Open
  PDF clicks (`publication_click` with `metadata.action = "open_pdf"`), download,
  filter_change, share_click, signup, chooser_select, recommendation_click,
  my_table_add/open/remove. Ordinary untagged publication navigation is excluded.
- Never queued by automatic `pdf_open`, server-side `download_served`, page views,
  impressions, heartbeats, human signals, scrolling, or recommendation views.
  `search` is also excluded: archive.tsx emits it from an effect, including when
  a URL query loads automatically. Search analytics remain intact.
- Before even a dry-run message is generated, the function reads **all canonical
  rows for that session** with the existing service-role environment credential,
  verifies the queued event ID and deliberate action against those rows, and
  runs the shared `classifySessions()` implementation from src/lib/human-sessions.ts.
  Only its `high_confidence_human` / `likely_human` sessions qualify.
- Internal and Lovable provenance on **any session row** suppress the alert,
  even if the click row itself has no marker. No geographic blocking rules.
  The shared classifier's existing network/cadence rules are reused, not replaced.
- Missing credentials, failed/malformed evidence, missing canonical event,
  or reads reaching the 10,000-row safety cap yield `unverified`; no push.
  Reads are paginated in 1,000-row pages with a timeout per request.
- Queue uniqueness (`on conflict (session_id) do nothing`) permits one candidate
  per session. This does not guarantee exactly-once delivery if the webhook
  itself retries after a successful push.
- Raw analytics and the original queue are never rewritten or deleted.
- Shared-secret header `x-webhook-secret`; wrong table, passive actions and
  missing session are rejected. Dry-run controls: `VISITOR_ALERT_DRY_RUN=1`,
  `x-dry-run: 1`, or `record.dry_run`. Mock tests never use live Pushover.
- Message: "Visitor engaged: clicked Open PDF" (or the actual action), with
  browser status as secondary metadata and "not proof of a human".

The review branch disables Vercel automatic deployments for
`fix/visitor-alert-deliberate-actions-20261009` in vercel.json. Other branches
retain their existing behavior. Do not merge or publish without owner approval.

## Build the reviewable function artifact (no deployment)
The staged source imports the actual shared classifier, avoiding a copied verdict
or a separate human-classification implementation. **Do not deploy the source
folder directly**: bundle the entrypoint from the repository root first so Deno
receives a single module without repository-relative/extensionless imports:

```sh
npx esbuild docs/visitor-alert-fix/visitor-alert/index.ts --bundle --platform=neutral --format=esm --outfile=/tmp/visitor-alert-stage/visitor-alert/index.ts
```

Review that artifact, then use it only in the approved external deployment.
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are standard Edge Function
server environment values used for the read-only lookup; never put the key in
source, a client bundle, or webhook metadata.

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
2. Set `VISITOR_ALERT_DRY_RUN=1`, then deploy the **bundled artifact** keeping
   `verify_jwt = true` (do not disable JWT verification).
   **Outage note:** from this moment the old `visitor_alert_push` webhook's payloads
   (table `visitor_alert_queue`, no `x-webhook-secret`) are rejected
   (`unauthorized` / `wrong_table`), so no Pushover alerts are sent until step 5
   permits live notifications.
3. Run `migration.sql`.
4. Create the new webhook on `engaged_visitor_alert_queue` (INSERT) → `visitor-alert`.
   Keep the same `Authorization: Bearer …` header the current webhook uses (needed
   for `verify_jwt`), and add header `x-webhook-secret: <value from step 1>`, entered
   only in the webhook settings. Then disable/delete `visitor_alert_push`.
5. After explicit owner approval for deployment, verify with dry-run only and
   confirm canonical session qualification in function logs. Keep
   `VISITOR_ALERT_DRY_RUN=1` until the owner separately approves live notifications.
   Do not insert synthetic test events into production analytics.

**What changes and what doesn't:** `queue_visitor_alert()` stays installed, so
`visitor_alert_queue` **keeps filling** with raw first page views. Only the old
*push notifications* stop, once `visitor_alert_push` is switched off.

## Rollback
Run `rollback.sql`, re-enable `visitor_alert_push` (with its original Bearer header),
and redeploy the saved original function.

## Tests and read-only verification
- `src/lib/visitor-alert.test.ts`: classifier, canonical lookup, pagination,
  malformed/failed evidence, passive events, dry-run and mocked push responses.
- `src/lib/open-pdf-clicks.test.ts` and `src/lib/human-sessions.test.ts`: adjacent
  shared classifier and click semantics regressions.
- SQL: use a **fresh local disposable database**, then execute `fixture.sql`,
  `migration.sql` (twice to check rerunning), and `regression.sql` in that order
  in the same connection. The regression file requires the isolated fixture
  marker, asserts preview/navigation suppression, action metadata, session
  deduplication, internal/provenance exclusion and preservation of raw rows.
  Never run fixture/regression SQL against a real analytics project.
- Read-only external inspection on October 9, 2026 confirmed project
  `torah-by-the-table` (`kwdeyzumetmjcvtbqnzl`) is accessible, the staged queue
  is absent, `visitor_alert_push` remains on the original queue, and deployed
  `visitor-alert` version 3 still sends first-visit messages without engagement
  qualification (`verify_jwt=true`). No live function was invoked and no
  database, webhook, secret, deployment or notification setting was changed.

No city, region, country or IP-range eligibility/blocking rules are introduced.

Validation: 34 relevant Vitest tests passed; isolated PGlite SQL trigger and
rerun checks passed; strict TypeScript checks and esbuild bundle passed; bundled
entrypoint passed with mocked Deno/fetch and zero Pushover calls. Full app build
was not run: the existing package-lock.json is out of sync with package.json,
so npm ci fails before installation. Dependencies/lockfile were not changed.
