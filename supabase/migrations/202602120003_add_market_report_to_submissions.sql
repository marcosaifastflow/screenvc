-- Store generated investment memorandum / market report per submission.
-- Generated once and reused to reduce OpenAI token usage.

alter table public.submissions
  add column if not exists ai_market_report jsonb;

create index if not exists idx_submissions_ai_market_report_gin
  on public.submissions using gin (ai_market_report);
