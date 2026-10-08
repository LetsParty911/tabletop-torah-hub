-- STAGED — rollback for migration.sql. Removes only the new engaged-alert path.
-- Raw analytics_events and the original visitor_alert_queue are untouched.
-- After running, repoint the database webhook back to visitor_alert_queue and
-- redeploy the saved original visitor-alert function source (README step 0).
begin;
drop trigger if exists trg_queue_engaged_visitor_alert on public.analytics_events;
drop function if exists public.queue_engaged_visitor_alert();
-- Optional: keep the table for audit. Uncomment to remove it.
-- drop table if exists public.engaged_visitor_alert_queue;
commit;
