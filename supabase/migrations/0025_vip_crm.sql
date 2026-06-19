-- VIP CRM — a standalone watchlist of people to track for future projects.
-- Not a pipeline (no stages): each card is a person + contact + a free-text tag
-- (a future project or VIP type) and a note on why we're tracking them.
-- Manual cards, optionally promoted from existing signups.
-- (Applied to cloud via the management API.)
create table if not exists vip_crm_cards (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  tag text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_vip_crm_created on vip_crm_cards (created_at desc);
