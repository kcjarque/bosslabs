-- ─── Tracked campaigns + multi-campaign ad spend ─────────────────────────────
-- Lets admins choose which Meta campaigns to include in the ad-spend dashboard.
-- Requires changing ad_spend_daily PK from date alone → (date, campaign_id) so
-- multiple campaigns can be stored and aggregated per day.

-- 1. Backfill any rows that somehow got a NULL campaign_id
update ad_spend_daily
set campaign_id = '120247301997590236'
where campaign_id is null;

-- 2. Make campaign_id non-null
alter table ad_spend_daily
  alter column campaign_id set not null,
  alter column campaign_id set default '120247301997590236';

-- 3. Swap the primary key to composite (date, campaign_id)
alter table ad_spend_daily drop constraint ad_spend_daily_pkey;
alter table ad_spend_daily add primary key (date, campaign_id);

-- 4. Tracked campaigns registry
create table if not exists tracked_campaigns (
  campaign_id   text primary key,
  campaign_name text not null,
  tracked       boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table tracked_campaigns enable row level security;

-- Seed with the existing campaign
insert into tracked_campaigns (campaign_id, campaign_name)
values ('120247301997590236', 'BOSSLABS AI | SALES')
on conflict (campaign_id) do nothing;
