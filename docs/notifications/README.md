# Owner notifications (generic Pushover alerts)

Separate from, and never touching: the existing first-load visitor alert
(`visitor_alert_queue` → `visitor-alert` function), the staged two-stage visitor alert
(`docs/visitor-alert-fix/`), and all VPN detection/blocking/alerts.

## Status — Phase A (preview code only, NOT live)
- Storage: `migration-notifications.sql` — **staged, not applied**. The app cannot change the
  analytics database's structure; the owner must run it in that database's SQL editor (or grant
  a migration-capable connection). Additive, no triggers, no webhooks; can't send by itself.
  Rollback: `rollback-notifications.sql`. Until applied, the admin tab shows "not installed" and
  every enqueue is a logged no-op (sign-ups are never affected).
- Defaults: master OFF, practice mode (dry run) ON, every category OFF.
- Dispatch runs only when an admin presses "Check & send now" (no cron yet).

## Tables
| Table | Purpose |
|---|---|
| notification_settings | singleton: master switch, dry run, mode, quiet hours (ET) |
| notification_rules | per-category on/off |
| notification_outbox | one row per `event_key` (UNIQUE); pending → sending (2-min lease) → sent / failed (backoff 1,2,4… min, max 5) / dead / dry_run / skipped |
| notification_delivery_log | every outcome; `sent` = Pushover accepted, not proof the phone showed it |
| notification_schedule_state | cursors (e.g. engaged-queue ingest position) |
Claims use `FOR UPDATE SKIP LOCKED`; `finish_notification` only updates rows still leased.
All tables RLS-on, service role only; admin access is via ADMIN_EMAILS-verified server functions.

## The 10 categories
| # | Category | Status | Trigger / dedup key |
|---|---|---|---|
| 1 | Engaged reader | **built** | first deliberate action (dashboard MEANINGFUL_INTENT) from the existing `engaged_visitor_alert_queue`; excludes internal, Lovable, suspected automation; passive pdf_open never counts. `engaged_reader:<session>` |
| 2 | Shul Poster / OurKehilla | **built (engaged variant)** | same source; channel from the session's first page_view UTMs (`shul/poster` vs `ourkehilla`). Replaces #1 for that session: `campaign_engaged:<channel>:<session>`. The first-load alert is NOT duplicated or modified — it already labels Shul Poster, and upgrading it needs the coordinated visitor-alert cutover. |
| 3 | New subscriber | **built** | after Sender.net accepts a NEW subscriber and no local row existed; `new_subscriber:<sha256(email)>`; email masked |
| 4 | PDF milestone | planned | counted PDF opens crossing thresholds per week |
| 5 | WhatsApp sharing | planned | share_click / `/wa` arrivals |
| 6 | Website/PDF errors | planned | error events, PDF fetch failures |
| 7 | Email campaign trouble | planned | Sender.net failures |
| 8 | Thursday publication | planned | weekly content readiness |
| 9 | Daily ET report | planned | uses notification_schedule_state |
| 10 | Downtime | planned | needs an independent external monitor (can't self-report) |

## Rollout (each step needs owner approval)
1. Apply `migration-notifications.sql` to the analytics DB.
2. Publish; enable categories with practice mode ON; press "Check & send now"; review rows.
3. "Send test" → owner confirms phone receipt → turn practice mode off and master on.
