-- Notetaker bot tables: sessions, transcripts, and AI summaries for calls.

create table if not exists public.call_notetaker_sessions (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  owner_user_id uuid not null,
  session_id text,
  bot_name text not null default 'ScreenVC Notetaker',
  status text not null default 'requesting',
  error_message text,
  requested_at timestamptz not null default now(),
  joined_at timestamptz,
  ended_at timestamptz
);

create table if not exists public.call_transcripts (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  notetaker_session_id uuid not null,
  owner_user_id uuid not null,
  full_text text not null default '',
  segments jsonb not null default '[]'::jsonb,
  duration_seconds integer,
  word_count integer,
  created_at timestamptz not null default now()
);

create table if not exists public.call_summaries (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  notetaker_session_id uuid not null,
  owner_user_id uuid not null,
  overall_summary text not null default '',
  key_points jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  founder_impressions text,
  concerns jsonb not null default '[]'::jsonb,
  next_steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Idempotent column adds (same pattern as 202602120005)
alter table public.call_notetaker_sessions
  add column if not exists call_id uuid;
alter table public.call_notetaker_sessions
  add column if not exists owner_user_id uuid;
alter table public.call_notetaker_sessions
  add column if not exists session_id text;
alter table public.call_notetaker_sessions
  add column if not exists bot_name text default 'ScreenVC Notetaker';
alter table public.call_notetaker_sessions
  add column if not exists status text default 'requesting';
alter table public.call_notetaker_sessions
  add column if not exists error_message text;
alter table public.call_notetaker_sessions
  add column if not exists requested_at timestamptz default now();
alter table public.call_notetaker_sessions
  add column if not exists joined_at timestamptz;
alter table public.call_notetaker_sessions
  add column if not exists ended_at timestamptz;

alter table public.call_transcripts
  add column if not exists call_id uuid;
alter table public.call_transcripts
  add column if not exists notetaker_session_id uuid;
alter table public.call_transcripts
  add column if not exists owner_user_id uuid;
alter table public.call_transcripts
  add column if not exists full_text text default '';
alter table public.call_transcripts
  add column if not exists segments jsonb default '[]'::jsonb;
alter table public.call_transcripts
  add column if not exists duration_seconds integer;
alter table public.call_transcripts
  add column if not exists word_count integer;
alter table public.call_transcripts
  add column if not exists created_at timestamptz default now();

alter table public.call_summaries
  add column if not exists call_id uuid;
alter table public.call_summaries
  add column if not exists notetaker_session_id uuid;
alter table public.call_summaries
  add column if not exists owner_user_id uuid;
alter table public.call_summaries
  add column if not exists overall_summary text default '';
alter table public.call_summaries
  add column if not exists key_points jsonb default '[]'::jsonb;
alter table public.call_summaries
  add column if not exists action_items jsonb default '[]'::jsonb;
alter table public.call_summaries
  add column if not exists founder_impressions text;
alter table public.call_summaries
  add column if not exists concerns jsonb default '[]'::jsonb;
alter table public.call_summaries
  add column if not exists next_steps jsonb default '[]'::jsonb;
alter table public.call_summaries
  add column if not exists created_at timestamptz default now();

-- Foreign keys
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'call_notetaker_sessions_call_id_fkey') then
    alter table public.call_notetaker_sessions
      add constraint call_notetaker_sessions_call_id_fkey
      foreign key (call_id) references public.application_calls(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'call_notetaker_sessions_owner_user_id_fkey') then
    alter table public.call_notetaker_sessions
      add constraint call_notetaker_sessions_owner_user_id_fkey
      foreign key (owner_user_id) references auth.users(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'call_transcripts_call_id_fkey') then
    alter table public.call_transcripts
      add constraint call_transcripts_call_id_fkey
      foreign key (call_id) references public.application_calls(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'call_transcripts_notetaker_session_id_fkey') then
    alter table public.call_transcripts
      add constraint call_transcripts_notetaker_session_id_fkey
      foreign key (notetaker_session_id) references public.call_notetaker_sessions(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'call_transcripts_owner_user_id_fkey') then
    alter table public.call_transcripts
      add constraint call_transcripts_owner_user_id_fkey
      foreign key (owner_user_id) references auth.users(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'call_summaries_call_id_fkey') then
    alter table public.call_summaries
      add constraint call_summaries_call_id_fkey
      foreign key (call_id) references public.application_calls(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'call_summaries_notetaker_session_id_fkey') then
    alter table public.call_summaries
      add constraint call_summaries_notetaker_session_id_fkey
      foreign key (notetaker_session_id) references public.call_notetaker_sessions(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'call_summaries_owner_user_id_fkey') then
    alter table public.call_summaries
      add constraint call_summaries_owner_user_id_fkey
      foreign key (owner_user_id) references auth.users(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

-- Indexes
create index if not exists idx_notetaker_sessions_call
  on public.call_notetaker_sessions (call_id, requested_at desc);
create index if not exists idx_notetaker_sessions_owner
  on public.call_notetaker_sessions (owner_user_id, requested_at desc);
create index if not exists idx_notetaker_sessions_status
  on public.call_notetaker_sessions (status);

create index if not exists idx_call_transcripts_call
  on public.call_transcripts (call_id);
create index if not exists idx_call_transcripts_owner
  on public.call_transcripts (owner_user_id, created_at desc);

create index if not exists idx_call_summaries_call
  on public.call_summaries (call_id);
create index if not exists idx_call_summaries_owner
  on public.call_summaries (owner_user_id, created_at desc);

-- Row Level Security
alter table public.call_notetaker_sessions enable row level security;
alter table public.call_transcripts enable row level security;
alter table public.call_summaries enable row level security;

drop policy if exists call_notetaker_sessions_owner_all on public.call_notetaker_sessions;
create policy call_notetaker_sessions_owner_all on public.call_notetaker_sessions
for all
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists call_transcripts_owner_all on public.call_transcripts;
create policy call_transcripts_owner_all on public.call_transcripts
for all
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists call_summaries_owner_all on public.call_summaries;
create policy call_summaries_owner_all on public.call_summaries
for all
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());
