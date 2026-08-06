-- 0053_ads_council.sql — Ads Council data spine (spec 2026-08-06).
create table if not exists ad_metrics_daily (
  brand text not null default 'BOSS',
  campaign_id text not null,
  campaign_name text not null default '',
  adset_id text not null default '',
  adset_name text not null default '',
  ad_id text not null,
  ad_name text not null default '',
  date date not null,
  spend_centavos bigint not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  frequency numeric,
  ctr numeric,
  link_ctr numeric,
  cpm numeric,
  link_clicks bigint not null default 0,
  purchases int not null default 0,
  revenue_centavos bigint not null default 0,
  synced_at timestamptz not null default now(),
  primary key (ad_id, date)
);
create index if not exists idx_amd_brand_date on ad_metrics_daily (brand, date);
create index if not exists idx_amd_campaign_date on ad_metrics_daily (campaign_id, date);

create table if not exists ad_account_priors (
  brand text primary key,
  daily_cpp_sigma_pct numeric,
  median_winner_lifespan_days numeric,
  cpp_drift_pct_per_week numeric,
  weekday_multipliers jsonb,
  sample_days int not null default 0,
  computed_at timestamptz not null default now()
);

create table if not exists ad_verdict_history (
  brand text not null default 'BOSS',
  ad_id text not null,
  ad_name text not null default '',
  date date not null,
  verdict text not null check (verdict in ('LEARNING','WINNING','WATCH','LOSER')),
  role text not null check (role in ('PROSPECTOR','CLOSER','HYBRID')),
  days_in_tier int not null default 1,
  changed boolean not null default false,
  degraded boolean not null default false,
  deciding_metrics jsonb not null default '{}'::jsonb,
  headline_advice text not null default '',
  full_interpretation text not null default '',
  tier_flip_condition text not null default '',
  created_at timestamptz not null default now(),
  primary key (ad_id, date)
);
create index if not exists idx_avh_brand_date on ad_verdict_history (brand, date desc);
create index if not exists idx_avh_changed on ad_verdict_history (date desc) where changed;

create table if not exists council_settings (
  brand text primary key,
  mode text not null default 'recommend' check (mode in ('recommend','one_click','autopilot')),
  target_cpp_centavos bigint not null default 50000,
  updated_at timestamptz not null default now()
);
insert into council_settings (brand) values ('BOSS') on conflict do nothing;

create table if not exists council_sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  brand text not null default 'BOSS',
  trigger_reasons text[] not null default '{}',
  data_mode text not null default 'B' check (data_mode in ('A','B')),
  transcript_md text not null default '',
  verdict jsonb not null default '{}'::jsonb,
  model text not null default '',
  input_tokens int, output_tokens int,
  created_at timestamptz not null default now()
);
create index if not exists idx_cs_brand_date on council_sessions (brand, date desc);

create table if not exists council_predictions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  brand text not null default 'BOSS',
  expert text not null check (expert in ('CHARLEY','NICK','BEN','DARA','CHAIR')),
  session_id uuid references council_sessions(id) on delete set null,
  conflict_ref text,
  action_taken boolean not null default false,
  prediction_text text not null,
  metric text not null default '',
  threshold numeric,
  target_id text,            -- ad_id or campaign_id the metric applies to
  deadline date not null,
  weight numeric not null default 1.0,
  outcome text check (outcome in ('hit','miss','push')),
  needs_manual boolean not null default false,
  resolved_date date,
  notes text not null default ''
);
create index if not exists idx_cp_open on council_predictions (brand, deadline) where outcome is null;

create table if not exists council_actions (
  id uuid primary key default gen_random_uuid(),
  date date not null default now()::date,
  brand text not null default 'BOSS',
  session_id uuid references council_sessions(id) on delete set null,
  action_type text not null check (action_type in ('pause_ad','unpause_ad','set_budget')),
  target_id text not null,
  before jsonb not null default '{}'::jsonb,
  after jsonb not null default '{}'::jsonb,
  mode text not null,
  executed_by text not null default 'system',
  result text not null default '',
  created_at timestamptz not null default now()
);
