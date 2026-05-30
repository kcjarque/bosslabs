-- Affiliate / referral system.
-- Run once in Supabase. Idempotent (IF NOT EXISTS).

create table if not exists affiliates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- link slug, e.g. "kyle" → /r/kyle or ?ref=kyle
  name text not null,
  email text default '',
  commission_type text not null default 'percent'
    check (commission_type in ('percent', 'fixed')),
  commission_value numeric not null default 0, -- percent (e.g. 20 = 20%) OR centavos (fixed)
  dashboard_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Every first-touch click (for the affiliate dashboard's clicks → conversion).
create table if not exists affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  session_id text default '',
  landing_path text default '',
  referrer text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_aff_clicks_affiliate
  on affiliate_clicks (affiliate_id, created_at desc);

-- Commission ledger — one row per converted (paid) signup. Idempotent.
create table if not exists affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  signup_id text not null unique,            -- one commission per signup
  sale_centavos integer not null default 0,  -- total paid (incl OTO)
  commission_centavos integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'void')),
  created_at timestamptz not null default now()
);
create index if not exists idx_aff_comm_affiliate
  on affiliate_commissions (affiliate_id, created_at desc);
