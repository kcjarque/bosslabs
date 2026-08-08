-- 0056_ad_metrics_video_funnel.sql — creative + funnel diagnosis columns.
-- video_3s = 3-second video views (thumbstop / hook), thruplays = ≥15s or
-- complete (hold), lp_views = landing_page_view (the click actually loaded).
-- All 0 on image ads (no video actions) — the council treats hook/hold as N/A
-- for images. Backfilled by re-running syncAdMetricsDaily over the trailing window.
alter table ad_metrics_daily
  add column if not exists video_3s int not null default 0,
  add column if not exists thruplays int not null default 0,
  add column if not exists lp_views int not null default 0;
