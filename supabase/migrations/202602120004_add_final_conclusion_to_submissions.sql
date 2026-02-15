-- Store generated final investment conclusions for each submission.
-- Keeps separate cached states for pre-report and post-report conclusions.

alter table public.submissions
  add column if not exists ai_final_conclusion jsonb;

create index if not exists idx_submissions_ai_final_conclusion_gin
  on public.submissions using gin (ai_final_conclusion);
