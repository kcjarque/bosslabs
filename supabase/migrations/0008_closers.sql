-- Sales-closer subsystem.
--
-- Closers (Benny/Noel/Julius) get their own scoped login at /closer. They
-- claim abandoned-cart leads (phone number revealed only to the assignee),
-- and earn a commission when that customer pays.

-- 1) Closer accounts — username/password login, scoped to /closer.
create table if not exists closer_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null,
  email text,
  password_hash text,                          -- scrypt; null = login disabled
  role text not null default 'closer',
  commission_percent numeric not null default 20,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists closer_accounts_username_key
  on closer_accounts (lower(username));

-- 2) Lead assignment + per-closer pipeline. A signup is claimed by at most
--    one closer (unique signup_id) — that's what makes the phone private.
create table if not exists closer_leads (
  id uuid primary key default gen_random_uuid(),
  signup_id text not null references signups(id) on delete cascade,
  closer_id uuid not null references closer_accounts(id) on delete cascade,
  stage text not null default 'new',           -- new | contacted | closed | lost
  claimed_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists closer_leads_signup_key on closer_leads (signup_id);
create index if not exists closer_leads_closer_idx on closer_leads (closer_id, stage);

-- 3) Commission ledger — one row per closed sale (idempotent on signup_id).
create table if not exists closer_commissions (
  id uuid primary key default gen_random_uuid(),
  closer_id uuid not null references closer_accounts(id) on delete cascade,
  signup_id text not null,
  sale_centavos integer not null,              -- total the customer paid (incl OTO)
  percent numeric not null,
  amount_centavos integer not null,            -- the commission itself
  status text not null default 'pending',      -- pending | paid | void
  created_at timestamptz not null default now()
);
create unique index if not exists closer_commissions_signup_key
  on closer_commissions (signup_id);
create index if not exists closer_commissions_closer_idx on closer_commissions (closer_id);

-- 4) Email on the existing (env-password) admin account.
alter table settings add column if not exists admin_email text default '';
