-- Communication tables for VC-startup email threads and scheduled calls.

create table if not exists public.application_emails (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  thread_id text not null,
  form_external_id text,
  submission_external_id text,
  company_name text,
  startup_email text not null,
  vc_email text not null,
  direction text not null default 'outbound',
  subject text not null,
  body text not null,
  provider_status text not null default 'sent',
  provider_message_id text,
  in_reply_to text,
  created_at timestamptz not null default now()
);

create table if not exists public.application_calls (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  form_external_id text,
  submission_external_id text,
  company_name text,
  startup_email text not null,
  vc_email text not null,
  scheduled_at timestamptz not null,
  timezone text not null,
  duration_minutes integer not null default 30,
  meet_link text,
  google_event_id text,
  status text not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now()
);

alter table public.application_emails
  add column if not exists owner_user_id uuid;
alter table public.application_emails
  add column if not exists thread_id text;
alter table public.application_emails
  add column if not exists form_external_id text;
alter table public.application_emails
  add column if not exists submission_external_id text;
alter table public.application_emails
  add column if not exists company_name text;
alter table public.application_emails
  add column if not exists startup_email text;
alter table public.application_emails
  add column if not exists vc_email text;
alter table public.application_emails
  add column if not exists direction text default 'outbound';
alter table public.application_emails
  add column if not exists subject text;
alter table public.application_emails
  add column if not exists body text;
alter table public.application_emails
  add column if not exists provider_status text default 'sent';
alter table public.application_emails
  add column if not exists provider_message_id text;
alter table public.application_emails
  add column if not exists in_reply_to text;
alter table public.application_emails
  add column if not exists created_at timestamptz default now();

alter table public.application_calls
  add column if not exists owner_user_id uuid;
alter table public.application_calls
  add column if not exists form_external_id text;
alter table public.application_calls
  add column if not exists submission_external_id text;
alter table public.application_calls
  add column if not exists company_name text;
alter table public.application_calls
  add column if not exists startup_email text;
alter table public.application_calls
  add column if not exists vc_email text;
alter table public.application_calls
  add column if not exists scheduled_at timestamptz;
alter table public.application_calls
  add column if not exists timezone text;
alter table public.application_calls
  add column if not exists duration_minutes integer default 30;
alter table public.application_calls
  add column if not exists meet_link text;
alter table public.application_calls
  add column if not exists google_event_id text;
alter table public.application_calls
  add column if not exists status text default 'scheduled';
alter table public.application_calls
  add column if not exists notes text;
alter table public.application_calls
  add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'application_emails_owner_user_id_fkey') then
    alter table public.application_emails
      add constraint application_emails_owner_user_id_fkey
      foreign key (owner_user_id) references auth.users(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'application_calls_owner_user_id_fkey') then
    alter table public.application_calls
      add constraint application_calls_owner_user_id_fkey
      foreign key (owner_user_id) references auth.users(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

create index if not exists idx_application_emails_owner_created
  on public.application_emails (owner_user_id, created_at desc);
create index if not exists idx_application_emails_thread_created
  on public.application_emails (thread_id, created_at asc);
create index if not exists idx_application_emails_submission
  on public.application_emails (submission_external_id, created_at desc);

create index if not exists idx_application_calls_owner_scheduled
  on public.application_calls (owner_user_id, scheduled_at desc);
create index if not exists idx_application_calls_status_scheduled
  on public.application_calls (status, scheduled_at desc);
create index if not exists idx_application_calls_submission
  on public.application_calls (submission_external_id, created_at desc);

alter table public.application_emails enable row level security;
alter table public.application_calls enable row level security;

drop policy if exists application_emails_owner_all on public.application_emails;
create policy application_emails_owner_all on public.application_emails
for all
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists application_calls_owner_all on public.application_calls;
create policy application_calls_owner_all on public.application_calls
for all
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());
