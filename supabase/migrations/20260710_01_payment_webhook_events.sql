-- Payment webhook event ledger for dedupe, replay handling, and observability.
-- Migration ID: 20260710_01_payment_webhook_events

begin;

create table if not exists public.dongni_webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_key text not null,
  event_type text not null default '',
  source text not null default '',
  order_id text not null default '',
  capture_id text not null default '',
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists dongni_webhook_events_event_key_uidx
  on public.dongni_webhook_events (event_key);

create index if not exists dongni_webhook_events_provider_created_at_idx
  on public.dongni_webhook_events (provider, created_at desc);

alter table public.dongni_webhook_events enable row level security;

drop policy if exists "deny client read webhook events" on public.dongni_webhook_events;
create policy "deny client read webhook events"
  on public.dongni_webhook_events
  for all
  to authenticated
  using (false)
  with check (false);

commit;
