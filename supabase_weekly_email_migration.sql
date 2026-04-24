-- =====================================================================
-- Weekly Email System v1 — run in Supabase SQL editor.
-- Idempotent / safe for existing production data.
-- =====================================================================

-- ---------- subscribers: add unsubscribe fields if missing ----------
alter table public.subscribers
  add column if not exists active boolean not null default true;

alter table public.subscribers
  add column if not exists unsubscribe_token text;

alter table public.subscribers
  add column if not exists unsubscribed_at timestamptz;

-- Backfill tokens for any existing subscriber without one.
update public.subscribers
  set unsubscribe_token = encode(gen_random_bytes(24), 'hex')
  where unsubscribe_token is null;

-- Make token NOT NULL + unique now that everyone has one.
alter table public.subscribers
  alter column unsubscribe_token set not null;

do $$ begin
  alter table public.subscribers
    add constraint subscribers_unsubscribe_token_key unique (unsubscribe_token);
exception when duplicate_table or duplicate_object then null; end $$;

-- Auto-generate token on future inserts that don't supply one.
create or replace function public.subscribers_set_unsubscribe_token()
returns trigger
language plpgsql
as $$
begin
  if new.unsubscribe_token is null then
    new.unsubscribe_token := encode(gen_random_bytes(24), 'hex');
  end if;
  if new.active is null then
    new.active := true;
  end if;
  return new;
end;
$$;

drop trigger if exists subscribers_set_token on public.subscribers;
create trigger subscribers_set_token
  before insert on public.subscribers
  for each row execute function public.subscribers_set_unsubscribe_token();

create index if not exists subscribers_active_idx on public.subscribers (active);

-- ---------- weekly_email_sends: history + duplicate protection ----------
create table if not exists public.weekly_email_sends (
  id uuid primary key default gen_random_uuid(),
  parsha_key text not null,
  jewish_year integer not null,
  subject text not null,
  sent_at timestamptz not null default now(),
  sent_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  provider text,
  provider_message_id text,
  notes text,
  created_at timestamptz not null default now(),
  unique (parsha_key, jewish_year)
);

create index if not exists weekly_email_sends_year_idx
  on public.weekly_email_sends (jewish_year desc, sent_at desc);

alter table public.weekly_email_sends enable row level security;

drop policy if exists "weekly_email_sends_admin_all" on public.weekly_email_sends;
create policy "weekly_email_sends_admin_all" on public.weekly_email_sends
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- Done.
-- =====================================================================
