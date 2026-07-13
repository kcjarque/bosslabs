-- Links specific Meta ads to an affiliate, plus the affiliate's ad-earnings
-- commission rate. Admins choose which ads "belong" to an affiliate (the FB
-- link is manual — only we can see the ad account); the affiliate dashboard
-- then shows those ads' impressions + pixel-tracked revenue (fetched live from
-- Meta) and pays a % commission on that revenue.

alter table affiliates
  add column if not exists ad_commission_percent numeric not null default 5;

create table if not exists affiliate_ad_links (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  ad_id text not null,
  ad_name text,
  created_at timestamptz not null default now(),
  unique (affiliate_id, ad_id)
);

create index if not exists aal_affiliate_idx on affiliate_ad_links(affiliate_id);
create index if not exists aal_ad_idx on affiliate_ad_links(ad_id);
