-- OAuth mailbox connections for Gmail/Outlook per-user.

create table if not exists public.user_mailbox_connections (
  user_id uuid primary key,
  provider text not null,
  mailbox_email text not null,
  grant_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  status text not null default 'connected',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_mailbox_connections add column if not exists user_id uuid;
alter table public.user_mailbox_connections add column if not exists provider text;
alter table public.user_mailbox_connections add column if not exists mailbox_email text;
alter table public.user_mailbox_connections add column if not exists grant_id text;
alter table public.user_mailbox_connections add column if not exists access_token text;
alter table public.user_mailbox_connections add column if not exists refresh_token text;
alter table public.user_mailbox_connections add column if not exists token_expires_at timestamptz;
alter table public.user_mailbox_connections add column if not exists status text default 'connected';
alter table public.user_mailbox_connections add column if not exists last_synced_at timestamptz;
alter table public.user_mailbox_connections add column if not exists created_at timestamptz default now();
alter table public.user_mailbox_connections add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_mailbox_connections_user_id_fkey') then
    alter table public.user_mailbox_connections
      add constraint user_mailbox_connections_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
exception when others then
  null;
end $$;

alter table public.user_mailbox_connections enable row level security;

drop policy if exists user_mailbox_connections_owner_all on public.user_mailbox_connections;
create policy user_mailbox_connections_owner_all on public.user_mailbox_connections
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop trigger if exists trg_user_mailbox_connections_set_updated_at on public.user_mailbox_connections;
create trigger trg_user_mailbox_connections_set_updated_at
before update on public.user_mailbox_connections
for each row execute function public.set_updated_at();
