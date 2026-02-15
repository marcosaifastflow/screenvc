-- Per-VC linked email account used for outbound communications and call invites.

create table if not exists public.vc_email_accounts (
  user_id uuid primary key,
  linked_email text not null,
  display_name text,
  provider text not null default 'resend',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vc_email_accounts add column if not exists user_id uuid;
alter table public.vc_email_accounts add column if not exists linked_email text;
alter table public.vc_email_accounts add column if not exists display_name text;
alter table public.vc_email_accounts add column if not exists provider text default 'resend';
alter table public.vc_email_accounts add column if not exists created_at timestamptz default now();
alter table public.vc_email_accounts add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vc_email_accounts_user_id_fkey') then
    alter table public.vc_email_accounts
      add constraint vc_email_accounts_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
exception when others then
  null;
end $$;

create index if not exists idx_vc_email_accounts_linked_email
  on public.vc_email_accounts (linked_email);

alter table public.vc_email_accounts enable row level security;

drop policy if exists vc_email_accounts_owner_all on public.vc_email_accounts;
create policy vc_email_accounts_owner_all on public.vc_email_accounts
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop trigger if exists trg_vc_email_accounts_set_updated_at on public.vc_email_accounts;
create trigger trg_vc_email_accounts_set_updated_at
before update on public.vc_email_accounts
for each row execute function public.set_updated_at();
