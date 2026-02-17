-- Deal Intelligence Reports: AI-generated structured analysis from call transcripts.

create table if not exists public.call_intelligence_reports (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  owner_user_id uuid not null,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotent column adds
alter table public.call_intelligence_reports
  add column if not exists call_id uuid;
alter table public.call_intelligence_reports
  add column if not exists owner_user_id uuid;
alter table public.call_intelligence_reports
  add column if not exists report jsonb default '{}'::jsonb;
alter table public.call_intelligence_reports
  add column if not exists created_at timestamptz default now();
alter table public.call_intelligence_reports
  add column if not exists updated_at timestamptz default now();

-- Unique constraint: one report per call
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'call_intelligence_reports_call_id_unique') then
    alter table public.call_intelligence_reports
      add constraint call_intelligence_reports_call_id_unique unique (call_id);
  end if;
exception when others then
  null;
end$$;

-- Foreign keys
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'call_intelligence_reports_call_id_fkey') then
    alter table public.call_intelligence_reports
      add constraint call_intelligence_reports_call_id_fkey
      foreign key (call_id) references public.application_calls(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'call_intelligence_reports_owner_user_id_fkey') then
    alter table public.call_intelligence_reports
      add constraint call_intelligence_reports_owner_user_id_fkey
      foreign key (owner_user_id) references auth.users(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

-- Indexes
create index if not exists idx_intelligence_reports_call
  on public.call_intelligence_reports (call_id);
create index if not exists idx_intelligence_reports_owner
  on public.call_intelligence_reports (owner_user_id, created_at desc);

-- Row Level Security
alter table public.call_intelligence_reports enable row level security;

drop policy if exists call_intelligence_reports_owner_all on public.call_intelligence_reports;
create policy call_intelligence_reports_owner_all on public.call_intelligence_reports
for all
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());
