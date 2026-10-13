-- Rollback for migration-notifications.sql. Touches only the generic notification objects.
begin;
drop function if exists public.retry_failed_notifications();
drop function if exists public.finish_notification(uuid, text, text);
drop function if exists public.claim_notifications(integer, integer);
drop table if exists public.notification_delivery_log;
drop table if exists public.notification_outbox;
drop table if exists public.notification_schedule_state;
drop table if exists public.notification_rules;
drop table if exists public.notification_settings;
commit;
