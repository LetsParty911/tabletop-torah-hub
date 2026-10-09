-- ISOLATED DATABASE ONLY. Never run this file against production: inserts
-- would invoke any existing analytics/Pushover triggers. The local harness
-- must create a fresh analytics_events fixture and set this safety marker.
do $$ begin
  if current_setting('visitor_alert_test.isolated', true) is distinct from 'yes' then
    raise exception 'Refusing alert regression inserts outside isolated fixture';
  end if;
end $$;

insert into public.analytics_events (session_id, event_id, event_name, metadata)
values
 ('preview', 'p1', 'page_view', '{}'),
 ('preview', 'p2', 'pdf_open', '{}'),
 ('preview', 'p3', 'heartbeat', '{}'),
 ('preview', 'p4', 'human_signal', '{}'),
 ('navigation', 'n1', 'publication_click', '{}'),
 ('navigation', 'n2', 'publication_click', '{"action":"other"}'),
 ('click', 'c1', 'publication_click', '{"action":"open_pdf"}'),
 ('click', 'c2', 'download', '{}'),
 ('share', 's1', 'share_click', '{}'),
 ('served', 'd1', 'download_served', '{}');
insert into public.analytics_events (session_id, event_id, event_name, is_internal)
values ('internal', 'i1', 'share_click', true);
insert into public.analytics_events (session_id, event_id, event_name, referrer_host)
values ('test', 't1', 'share_click', 'preview.lovable.app');
insert into public.analytics_events (session_id, event_id, event_name, utm_source)
values ('test2', 't2', 'share_click', 'lovable');

do $$ begin
  if (select count(*) from public.engaged_visitor_alert_queue) <> 2 then
    raise exception 'Only deliberate click and share should queue';
  end if;
  if (select trigger_metadata->>'action' from public.engaged_visitor_alert_queue where session_id='click') <> 'open_pdf' then
    raise exception 'Queue lost deliberate action metadata';
  end if;
  if (select count(*) from public.analytics_events) <> 13 then
    raise exception 'Raw analytics were changed or discarded';
  end if;
end $$;
