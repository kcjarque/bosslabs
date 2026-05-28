-- BOSSLABS AI — VibeCode Retreat reservations.
--
-- Captures pop-up reservation-form submissions and payment-proof status.
-- Run once in your Supabase project (SQL editor). Idempotent: safe to re-run.

create table if not exists retreat_reservations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text not null,
  payment_method text,              -- BPI | BDO | Maya
  payment_plan text,                -- full | reservation | installment
  overnight boolean,
  diet text default '',
  business text default '',
  build_idea text default '',
  extra_person_name text default '',
  tshirt_size text default '',
  heard_from text default '',
  amount_due_centavos integer,      -- the amount due "now" for the chosen plan
  status text not null default 'reserved',  -- reserved | proof_submitted
  proof_submitted_at timestamptz
);
