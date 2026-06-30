-- Mutual NDAs produced by the NDA Maker. Mirrors the contracts table: a
-- full snapshot of the form state, optional signup_id link so the customer
-- profile can surface "NDA signed" alongside contracts. No money fields —
-- NDAs are non-monetary so no totals or downpayment logic.
create table if not exists ndas (
  id uuid primary key default gen_random_uuid(),
  signup_id text references signups(id) on delete set null,

  -- BossLabs side (editable — registered address + SEC reg vary by signing date)
  bosslabs_office_address text,
  bosslabs_sec_reg_no text,

  -- Counterparty
  counterparty_company_name text not null,
  counterparty_office_address text,
  counterparty_rep_name text,
  counterparty_rep_position text,

  -- Recitals — the two "WHEREAS" lines specific to this engagement.
  counterparty_business_description text,
  purpose_description text,

  effective_date date not null default current_date,
  governing_venue text not null default 'Makati City',

  status text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ndas_signup_idx on ndas(signup_id);
create index if not exists ndas_status_idx on ndas(status);
create index if not exists ndas_created_idx on ndas(created_at desc);
