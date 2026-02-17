-- Portfolio companies table for tracking VC investments
create table if not exists public.portfolio_companies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  industry text,
  country text,
  continent text,
  funding_stage text check (funding_stage in ('pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'growth')),
  deal_size numeric,
  investment_date date,
  valuation numeric,
  equity_percent numeric,
  status text not null default 'active' check (status in ('active', 'exited', 'written-off')),
  submission_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast lookup by owner
create index if not exists idx_portfolio_companies_owner on public.portfolio_companies(owner_user_id);

-- Enable RLS
alter table public.portfolio_companies enable row level security;

-- Users can only see their own portfolio companies
create policy "Users can view own portfolio companies"
  on public.portfolio_companies for select
  using (owner_user_id = auth.uid());

create policy "Users can insert own portfolio companies"
  on public.portfolio_companies for insert
  with check (owner_user_id = auth.uid());

create policy "Users can update own portfolio companies"
  on public.portfolio_companies for update
  using (owner_user_id = auth.uid());

create policy "Users can delete own portfolio companies"
  on public.portfolio_companies for delete
  using (owner_user_id = auth.uid());
