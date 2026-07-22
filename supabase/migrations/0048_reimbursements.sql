-- Staff reimbursements.
--
-- Mirrors the closer commissions/payouts pattern (0008/0034): staff submit
-- expense claims (self-reported, no approval gate — same trust model as
-- commissions, which are also never individually reviewed before payout).
-- Admin tallies a staff member's pending claims, uploads a payment slip,
-- confirms — one payout row is created and those claims flip pending → paid,
-- linked by payout_id for an audit trail. Voiding reverts them to pending.

-- 1) Where a staff member gets paid. One method at a time (adapts in the UI):
--    pick bank or gcash, only that method's fields are expected to be filled.
alter table staff_accounts add column if not exists payout_method text
  check (payout_method in ('bank', 'gcash'));
alter table staff_accounts add column if not exists bank_name text;
alter table staff_accounts add column if not exists bank_account_name text;
alter table staff_accounts add column if not exists bank_account_number text;
alter table staff_accounts add column if not exists gcash_name text;
alter table staff_accounts add column if not exists gcash_number text;

-- 2) Payout batches — created first so reimbursement_requests can reference it.
create table if not exists reimbursement_payouts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_accounts(id) on delete cascade,
  amount_centavos bigint not null,
  request_count integer not null,
  slip_url text,                     -- public bucket URL of the payment slip
  slip_filename text,
  note text,
  status text not null default 'paid' check (status in ('paid', 'voided')),
  created_by text,                   -- admin name from the session
  paid_at timestamptz not null default now(),
  voided_at timestamptz
);
create index if not exists reimbursement_payouts_staff_idx
  on reimbursement_payouts (staff_id, paid_at desc);
create index if not exists reimbursement_payouts_status_idx
  on reimbursement_payouts (status, paid_at desc);

-- 3) Expense claims — one row per submitted reimbursement request.
create table if not exists reimbursement_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_accounts(id) on delete cascade,
  description text not null,
  category text not null default 'other'
    check (category in ('transport', 'meals', 'supplies', 'other')),
  amount_centavos integer not null check (amount_centavos > 0),
  spent_on date not null,
  receipt_url text,                  -- optional proof photo
  status text not null default 'pending' check (status in ('pending', 'paid', 'void')),
  payout_id uuid references reimbursement_payouts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists reimbursement_requests_staff_idx
  on reimbursement_requests (staff_id, status);
create index if not exists reimbursement_requests_payout_idx
  on reimbursement_requests (payout_id);

-- 4) Backlink so a paid reimbursement payout mirrors into the Finance expense
--    ledger, same as closer payouts (finance_expenses.payout_id / 0035) — a
--    separate column since that one is FK'd specifically to closer_payouts.
alter table finance_expenses
  add column if not exists reimbursement_payout_id uuid
  references reimbursement_payouts(id) on delete set null;
create unique index if not exists finance_expenses_reimbursement_payout_key
  on finance_expenses (reimbursement_payout_id) where reimbursement_payout_id is not null;
