-- 0055_prince_queries.sql — dedup + log for Prince's Telegram /prince command.
-- Telegram retries a webhook update if it doesn't get a fast 200; the PK on
-- update_id makes reprocessing a no-op (insert conflicts → we skip). Doubles
-- as a log of what was asked.
create table if not exists prince_queries (
  update_id bigint primary key,
  chat_id text not null default '',
  question text not null default '',
  created_at timestamptz not null default now()
);
