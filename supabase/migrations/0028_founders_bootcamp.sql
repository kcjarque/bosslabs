-- AI Founder's Bootcamp — reservations, CRM, webinar discount codes, ticket cap.
--
-- Pricing tiers (per-seat ₱):
--   single        →  35,000 (regular)
--   single_promo  →  25,000 (with active webinar code)
--   group3        →  22,000 × 3 = 66,000 total
--   group5        →  20,000 × 5 = 100,000 total
-- Downpayment-to-reserve = 10,000 × seats. Balance due before the bootcamp.
-- Hard cap: 80 seats total. Enforced both in the API and via the seats-left RPC.

create table if not exists bootcamp_reservations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Primary contact
  name text not null,
  email text not null,
  phone text not null,
  company text not null default '',

  -- Pricing
  tier text not null check (tier in ('single','single_promo','group3','group5')),
  seats int not null check (seats > 0 and seats <= 5),
  per_seat_centavos int not null,           -- locks the price at reservation time
  total_centavos int not null,              -- full deal = per_seat × seats
  amount_due_centavos int not null,         -- downpayment now (10,000 × seats)
  balance_due_centavos int not null,        -- total - amount_due

  -- Group reservations: roster of additional attendees (json array of {name,email,phone})
  group_members jsonb not null default '[]'::jsonb,

  -- Optional intake
  build_idea text not null default '',
  heard_from text not null default '',

  -- Discount code captured at reservation (audit trail; price is locked in per_seat_centavos)
  discount_code text not null default '',

  -- Payment
  payment_method text,                      -- 'Credit Card' | 'Bank Transfer'
  status text not null default 'reserved' check (status in ('reserved','proof_submitted','paid')),
  proof_submitted_at timestamptz,
  paid_at timestamptz,
  xendit_invoice_id text
);

create index if not exists idx_bootcamp_reservations_status on bootcamp_reservations (status);
create index if not exists idx_bootcamp_reservations_email on bootcamp_reservations (email);
create index if not exists idx_bootcamp_reservations_created on bootcamp_reservations (created_at desc);

-- CRM kanban — mirrors retreat_crm_cards. One card per reservation. Cards can
-- also be added manually for cold leads (reservation_id null).
create table if not exists bootcamp_crm_cards (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid unique references bootcamp_reservations(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  company text not null default '',
  stage text not null default 'interested',
  position int not null default 0,
  note text not null default '',
  -- Headcount the team confirmed on this card (overrides reservation.seats if larger
  -- after a group expansion). Drives the people badge.
  people int not null default 1 check (people > 0 and people <= 5),
  created_at timestamptz not null default now()
);
create index if not exists idx_bootcamp_crm_stage on bootcamp_crm_cards (stage, position);

-- Webinar discount codes. The funnel uses the most recent row where
-- now() between starts_at and expires_at AND is_active=true.
create table if not exists bootcamp_discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  per_seat_centavos int not null,           -- price each seat unlocks (e.g. 2,500,000 = ₱25,000)
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  is_active boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_bootcamp_codes_active on bootcamp_discount_codes (is_active, expires_at);

-- Returns total seats already locked (status='reserved' counts; cancelled/dropped doesn't).
-- 80 tickets max, hard cap.
create or replace function bootcamp_seats_taken() returns int as $$
  select coalesce(sum(seats), 0)::int from bootcamp_reservations
    where status in ('reserved','proof_submitted','paid');
$$ language sql stable;

create or replace function bootcamp_seats_remaining() returns int as $$
  select greatest(0, 80 - bootcamp_seats_taken());
$$ language sql stable;

-- Trigger: hard-block any insert that would push us past 80 seats.
create or replace function bootcamp_enforce_cap() returns trigger as $$
declare
  taken int;
begin
  select bootcamp_seats_taken() into taken;
  if (taken + new.seats) > 80 then
    raise exception 'BOOTCAMP_FULL: only % seat(s) remaining', greatest(0, 80 - taken)
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bootcamp_cap on bootcamp_reservations;
create trigger trg_bootcamp_cap
  before insert on bootcamp_reservations
  for each row execute function bootcamp_enforce_cap();
