-- User-scoped long-term memory for Dongni
-- Run this SQL in Supabase SQL Editor.

begin;

create table if not exists public.dongni_user_memory (
  user_id uuid primary key references auth.users(id) on delete cascade,
  summary text not null default '',
  important_facts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.dongni_memory_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_messages jsonb not null default '[]'::jsonb,
  assistant_reply text not null default '',
  memory_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dongni_memory_events_user_id_created_at_idx
  on public.dongni_memory_events (user_id, created_at desc);

alter table public.dongni_user_memory enable row level security;
alter table public.dongni_memory_events enable row level security;

-- Backend uses service-role key, so strict deny for normal clients.
-- If future frontend direct access is needed, add explicit authenticated policies.
drop policy if exists "deny client read memory" on public.dongni_user_memory;
create policy "deny client read memory"
  on public.dongni_user_memory
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists "deny client read memory events" on public.dongni_memory_events;
create policy "deny client read memory events"
  on public.dongni_memory_events
  for all
  to authenticated
  using (false)
  with check (false);

commit;
