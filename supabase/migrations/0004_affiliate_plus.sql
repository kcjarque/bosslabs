-- Affiliate notifications + promo-kit resources.
alter table affiliates add column if not exists telegram_chat_id text default '';
alter table affiliates add column if not exists notify_email boolean default true;
alter table affiliates add column if not exists notify_telegram boolean default false;

-- Single-row config for the shared promo kit shown to all affiliates.
create table if not exists affiliate_program (
  id integer primary key default 1,
  swipe_copy text default '',
  assets_url text default '',
  onepager_url text default '',
  updated_at timestamptz default now()
);
insert into affiliate_program (id) values (1) on conflict (id) do nothing;
