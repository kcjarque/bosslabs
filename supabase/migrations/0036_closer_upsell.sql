-- Closer upsell subsystem.
--
-- Feature 1: a claimable pool of PAID customers (post-webinar) that closers
--   work to upsell — same claim mechanic as the abandoned-cart pool, but a
--   separate table so it can't collide with closer_leads (which is unique per
--   signup for the abandoned pipeline).
--
-- Feature 2: per-lead promo codes scoped to ONE product (retreat / vault /
--   build_session), sent to the customer over SMS + email, with a send-status
--   log. Reuses the existing promo_codes discount engine + redeem function.

-- 1) Upsell pipeline — one closer per customer.
create table if not exists closer_upsell_leads (
  id uuid primary key default gen_random_uuid(),
  signup_id text not null references signups(id) on delete cascade,
  closer_id uuid not null references closer_accounts(id) on delete cascade,
  stage text not null default 'new',        -- new | contacted | sent | won | lost
  claimed_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists closer_upsell_leads_signup_key on closer_upsell_leads (signup_id);
create index if not exists closer_upsell_leads_closer_idx on closer_upsell_leads (closer_id, stage);

-- 2) Product scope + closer attribution on the shared promo_codes table.
--    product NULL = the code works anywhere (admin codes keep working); a set
--    product means the checkout for a DIFFERENT product must refuse it.
alter table promo_codes add column if not exists product text;
alter table promo_codes add column if not exists created_by_closer uuid references closer_accounts(id) on delete set null;

-- 3) Send log — one row per "generate code + blast SMS/email" action, with the
--    priced-out numbers and per-channel delivery status.
create table if not exists closer_promo_sends (
  id uuid primary key default gen_random_uuid(),
  upsell_lead_id uuid not null references closer_upsell_leads(id) on delete cascade,
  closer_id uuid not null references closer_accounts(id) on delete cascade,
  signup_id text not null,
  product text not null,                    -- retreat | vault | build_session
  promo_code text not null,
  discount_type text not null,              -- percent | fixed
  discount_value integer not null,
  base_centavos integer not null,
  discount_centavos integer not null,
  final_centavos integer not null,
  link text not null,
  email_status text not null default 'pending',   -- pending | sent | failed | skipped
  email_sent_at timestamptz,
  email_error text,
  sms_status text not null default 'pending',
  sms_sent_at timestamptz,
  sms_error text,
  created_at timestamptz not null default now()
);
create index if not exists closer_promo_sends_lead_idx on closer_promo_sends (upsell_lead_id, created_at desc);
create index if not exists closer_promo_sends_closer_idx on closer_promo_sends (closer_id, created_at desc);
