-- Backfill relational tables from existing KV records.
-- Safe to run multiple times.

-- Compatibility shim for legacy schemas that still have a NOT NULL forms.form_id column.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'forms'
      and column_name = 'form_id'
      and is_nullable = 'NO'
  ) then
    execute 'alter table public.forms alter column form_id drop not null';
  end if;
end $$;

-- Compatibility shim for legacy forms schemas that use name/user_id columns.
alter table public.forms add column if not exists name text;
alter table public.forms add column if not exists user_id uuid;

-- Compatibility shim for legacy forms.schema NOT NULL without defaults.
do $$
declare
  schema_data_type text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'forms'
      and column_name = 'schema'
  ) then
    select data_type
    into schema_data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'forms'
      and column_name = 'schema';

    if schema_data_type = 'jsonb' then
      execute 'alter table public.forms alter column "schema" set default ''[]''::jsonb';
    elsif schema_data_type = 'json' then
      execute 'alter table public.forms alter column "schema" set default ''[]''::json';
    else
      execute 'alter table public.forms alter column "schema" set default ''''';
    end if;
  end if;
end $$;

-- 1) Forms
insert into public.forms (
  external_form_id,
  user_id,
  owner_user_id,
  name,
  form_name,
  questions,
  thesis,
  status,
  published_at,
  updated_at,
  created_at
)
select
  value->>'formId' as external_form_id,
  (value->>'userId')::uuid as user_id,
  (value->>'userId')::uuid as owner_user_id,
  coalesce(value->>'formName', 'Application Form') as name,
  coalesce(value->>'formName', 'Application Form') as form_name,
  coalesce(value->'questions', '[]'::jsonb) as questions,
  coalesce(value->'thesis', '{}'::jsonb) as thesis,
  coalesce(value->>'status', 'active') as status,
  coalesce((value->>'publishedAt')::timestamptz, now()) as published_at,
  coalesce((value->>'updatedAt')::timestamptz, now()) as updated_at,
  coalesce((value->>'publishedAt')::timestamptz, now()) as created_at
from public.kv_store_26821bbd
where key like 'form:%'
  and value ? 'formId'
  and value ? 'userId'
on conflict (external_form_id)
do update set
  user_id = excluded.user_id,
  owner_user_id = excluded.owner_user_id,
  name = excluded.name,
  form_name = excluded.form_name,
  questions = excluded.questions,
  thesis = excluded.thesis,
  status = excluded.status,
  published_at = excluded.published_at,
  updated_at = excluded.updated_at;

-- 2) Submissions
insert into public.submissions (
  external_submission_id,
  form_id,
  data,
  is_high_value,
  ai_fit_evaluation,
  submitted_at,
  created_at
)
select
  value->>'submissionId' as external_submission_id,
  f.id as form_id,
  coalesce(value->'data', '{}'::jsonb) as data,
  coalesce((value->>'isHighValue')::boolean, (value->>'isHighLevel')::boolean, true) as is_high_value,
  value->'aiFitEvaluation' as ai_fit_evaluation,
  coalesce((value->>'submittedAt')::timestamptz, now()) as submitted_at,
  coalesce((value->>'submittedAt')::timestamptz, now()) as created_at
from public.kv_store_26821bbd kv
join public.forms f
  on f.external_form_id = kv.value->>'formId'
where kv.key like 'submission:%:%'
  and kv.value ? 'submissionId'
  and kv.value ? 'formId'
on conflict (external_submission_id)
do update set
  form_id = excluded.form_id,
  data = excluded.data,
  is_high_value = excluded.is_high_value,
  ai_fit_evaluation = excluded.ai_fit_evaluation,
  submitted_at = excluded.submitted_at;

-- 3) VC criteria
insert into public.vc_criteria (
  user_id,
  thesis,
  updated_at,
  created_at
)
select
  replace(key, 'criteria:', '')::uuid as user_id,
  coalesce(value->'thesis', '{}'::jsonb) as thesis,
  coalesce((value->>'updatedAt')::timestamptz, now()) as updated_at,
  coalesce((value->>'updatedAt')::timestamptz, now()) as created_at
from public.kv_store_26821bbd
where key like 'criteria:%'
on conflict (user_id)
do update set
  thesis = excluded.thesis,
  updated_at = excluded.updated_at;

-- 4) Favorites (key format: favorites:<userId>:<externalFormId>, value: [submissionId,...])
with favorite_rows as (
  select
    split_part(key, ':', 2)::uuid as user_id,
    split_part(key, ':', 3) as external_form_id,
    jsonb_array_elements_text(value) as external_submission_id
  from public.kv_store_26821bbd
  where key like 'favorites:%:%'
    and jsonb_typeof(value) = 'array'
)
insert into public.submission_favorites (user_id, submission_id, created_at)
select
  fr.user_id,
  s.id as submission_id,
  now() as created_at
from favorite_rows fr
join public.forms f
  on f.external_form_id = fr.external_form_id
join public.submissions s
  on s.form_id::text = f.id::text
 and s.external_submission_id = fr.external_submission_id
on conflict (user_id, submission_id) do nothing;
