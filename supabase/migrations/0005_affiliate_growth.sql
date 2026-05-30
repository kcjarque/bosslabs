-- Phase 2: sub-id (campaign) tracking
alter table affiliate_commissions add column if not exists sub text default '';
alter table affiliate_clicks add column if not exists sub text default '';

-- Phase 3: commission kind + tier/bonus config (one tier + one bonus, scalar)
alter table affiliate_commissions add column if not exists kind text default 'sale';
alter table affiliate_program add column if not exists tiers_enabled boolean default false;
alter table affiliate_program add column if not exists tier_min_sales integer default 10;
alter table affiliate_program add column if not exists tier_percent numeric default 0;
alter table affiliate_program add column if not exists bonus_at_sales integer default 0;
alter table affiliate_program add column if not exists bonus_amount_centavos integer default 0;
