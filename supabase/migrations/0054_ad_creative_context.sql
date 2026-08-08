-- 0054_ad_creative_context.sql — creative-strategy understanding for the Ads Council.
create table if not exists ad_creative_context (
  brand text not null default 'BOSS',
  ad_id text primary key,
  creative_id text,
  ad_name text not null default '',
  media_type text not null default 'other' check (media_type in ('video','image','other')),
  format text not null default '',
  angle text not null default '',
  persona text not null default '',
  awareness_level text not null default '',
  hook_text text not null default '',
  transcript text not null default '',
  visual_quality int,
  on_brand boolean,
  tags jsonb not null default '[]'::jsonb,
  model text not null default '',
  confidence numeric,
  creative_hash text not null default '',
  analyzed_at timestamptz not null default now()
);
create index if not exists idx_acc_brand on ad_creative_context (brand);
