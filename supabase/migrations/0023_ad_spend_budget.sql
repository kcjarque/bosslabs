-- Per-day set budget (what was configured in Ads Manager that day), so the Ads
-- results table can show Set vs Spent per day. Meta doesn't expose historical
-- daily budgets, so past rows are backfilled with the current daily budget as
-- an ESTIMATE; the /api/cron/ads-sync cron snapshots the real value nightly
-- going forward. NULL = unknown. Applied to cloud via the management API.
alter table ad_spend_daily
  add column if not exists budget_set_centavos bigint;
