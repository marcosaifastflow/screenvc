-- Create relational tables for forms, submissions, favorites, and VC criteria.
-- Resilient to partially-existing tables from prior attempts.

create extension if not exists pgcrypto;

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  external_form_id text,
  owner_user_id uuid,
  form_name text,
  questions jsonb default '[]'::jsonb,
  thesis jsonb default '{}'::jsonb,
  status text default 'active',
  published_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.forms add column if not exists id uuid default gen_random_uuid();
alter table public.forms add column if not exists external_form_id text;
alter table public.forms add column if not exists owner_user_id uuid;
alter table public.forms add column if not exists form_name text;
alter table public.forms add column if not exists questions jsonb default '[]'::jsonb;
alter table public.forms add column if not exists thesis jsonb default '{}'::jsonb;
alter table public.forms add column if not exists status text default 'active';
alter table public.forms add column if not exists published_at timestamptz default now();
alter table public.forms add column if not exists updated_at timestamptz default now();
alter table public.forms add column if not exists created_at timestamptz default now();

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  external_submission_id text,
  form_id uuid,
  data jsonb default '{}'::jsonb,
  is_high_value boolean default true,
  ai_fit_evaluation jsonb,
  submitted_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.submissions add column if not exists id uuid default gen_random_uuid();
alter table public.submissions add column if not exists external_submission_id text;
alter table public.submissions add column if not exists form_id uuid;
alter table public.submissions add column if not exists data jsonb default '{}'::jsonb;
alter table public.submissions add column if not exists is_high_value boolean default true;
alter table public.submissions add column if not exists ai_fit_evaluation jsonb;
alter table public.submissions add column if not exists submitted_at timestamptz default now();
alter table public.submissions add column if not exists created_at timestamptz default now();

create table if not exists public.submission_favorites (
  user_id uuid not null,
  submission_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, submission_id)
);

alter table public.submission_favorites add column if not exists user_id uuid;
alter table public.submission_favorites add column if not exists submission_id uuid;
alter table public.submission_favorites add column if not exists created_at timestamptz default now();

create table if not exists public.vc_criteria (
  user_id uuid primary key,
  thesis jsonb default '{}'::jsonb,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.vc_criteria add column if not exists user_id uuid;
alter table public.vc_criteria add column if not exists thesis jsonb default '{}'::jsonb;
alter table public.vc_criteria add column if not exists updated_at timestamptz default now();
alter table public.vc_criteria add column if not exists created_at timestamptz default now();

-- Constraints and FKs (best-effort idempotent)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'forms_external_form_id_key') then
    alter table public.forms add constraint forms_external_form_id_key unique (external_form_id);
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'submissions_external_submission_id_key') then
    alter table public.submissions add constraint submissions_external_submission_id_key unique (external_submission_id);
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'forms_owner_user_id_fkey') then
    alter table public.forms
      add constraint forms_owner_user_id_fkey
      foreign key (owner_user_id) references auth.users(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'submissions_form_id_fkey') then
    alter table public.submissions
      add constraint submissions_form_id_fkey
      foreign key (form_id) references public.forms(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'submission_favorites_user_id_fkey') then
    alter table public.submission_favorites
      add constraint submission_favorites_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'submission_favorites_submission_id_fkey') then
    alter table public.submission_favorites
      add constraint submission_favorites_submission_id_fkey
      foreign key (submission_id) references public.submissions(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vc_criteria_user_id_fkey') then
    alter table public.vc_criteria
      add constraint vc_criteria_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
exception when others then
  null;
end$$;

-- Query-performance indexes
create index if not exists idx_forms_owner_updated on public.forms (owner_user_id, updated_at desc);
create index if not exists idx_forms_status on public.forms (status);
create index if not exists idx_forms_external_form_id on public.forms (external_form_id);

create index if not exists idx_submissions_form_submitted_at on public.submissions (form_id, submitted_at desc);
create index if not exists idx_submissions_form_is_high_value on public.submissions (form_id, is_high_value, submitted_at desc);
create index if not exists idx_submissions_external_submission_id on public.submissions (external_submission_id);

create index if not exists idx_submission_favorites_user_created on public.submission_favorites (user_id, created_at desc);
create index if not exists idx_submission_favorites_submission on public.submission_favorites (submission_id);

create index if not exists idx_forms_questions_gin on public.forms using gin (questions);
create index if not exists idx_forms_thesis_gin on public.forms using gin (thesis);
create index if not exists idx_submissions_data_gin on public.submissions using gin (data);
create index if not exists idx_vc_criteria_thesis_gin on public.vc_criteria using gin (thesis);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_forms_set_updated_at on public.forms;
create trigger trg_forms_set_updated_at
before update on public.forms
for each row execute function public.set_updated_at();

drop trigger if exists trg_vc_criteria_set_updated_at on public.vc_criteria;
create trigger trg_vc_criteria_set_updated_at
before update on public.vc_criteria
for each row execute function public.set_updated_at();

alter table public.forms enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_favorites enable row level security;
alter table public.vc_criteria enable row level security;

drop policy if exists forms_owner_select on public.forms;
create policy forms_owner_select on public.forms
for select using (owner_user_id = auth.uid());

drop policy if exists forms_owner_insert on public.forms;
create policy forms_owner_insert on public.forms
for insert with check (owner_user_id = auth.uid());

drop policy if exists forms_owner_update on public.forms;
create policy forms_owner_update on public.forms
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists forms_owner_delete on public.forms;
create policy forms_owner_delete on public.forms
for delete using (owner_user_id = auth.uid());

drop policy if exists submissions_owner_select on public.submissions;
create policy submissions_owner_select on public.submissions
for select using (
  exists (
    select 1
    from public.forms f
    where f.id::text = submissions.form_id::text
      and f.owner_user_id = auth.uid()
  )
);

drop policy if exists submission_favorites_owner_all on public.submission_favorites;
create policy submission_favorites_owner_all on public.submission_favorites
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists vc_criteria_owner_all on public.vc_criteria;
create policy vc_criteria_owner_all on public.vc_criteria
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());
