-- Per-ad daily insights snapshot, refreshed twice a day (12nn + midnight
-- Manila) by /api/cron/affiliate-ads so the affiliate dashboard reads earnings
-- from storage (fast) instead of hitting Meta live on every load. Only ads
-- linked to an affiliate are synced. Money in centavos.
create table if not exists ad_insights_daily (
  ad_id text not null,
  date date not null,
  ad_name text,
  impressions bigint not null default 0,
  spend_centavos bigint not null default 0,
  revenue_centavos bigint not null default 0,
  synced_at timestamptz not null default now(),
  primary key (ad_id, date)
);

create index if not exists aid_ad_idx on ad_insights_daily(ad_id);
create index if not exists aid_date_idx on ad_insights_daily(date desc);
