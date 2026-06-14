-- ─── Daily ad spend (Meta) ───────────────────────────────────────────────
-- One row per calendar day (Asia/Manila, matched to the ad account's tz) for
-- the BOSSLABS AI | SALES campaign. ROAS is NOT stored — it's computed on read
-- (actual paid revenue that day ÷ spend that day) so it always reflects real
-- sales. Backfilled from May 24 (campaign start); kept current by the
-- /api/cron/ads-sync cron at 00:01 Manila.
create table if not exists ad_spend_daily (
  date          date primary key,
  spend_centavos bigint not null default 0,
  impressions   bigint not null default 0,
  clicks        bigint not null default 0,
  reach         bigint not null default 0,
  currency      text   not null default 'PHP',
  campaign_id   text,
  synced_at     timestamptz not null default now()
);
alter table ad_spend_daily enable row level security;
