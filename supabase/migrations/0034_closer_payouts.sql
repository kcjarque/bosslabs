-- Closer payouts ledger.
--
-- Per-closer payout: admin tallies pending commissions for one closer,
-- uploads the bank deposit slip, confirms — system creates a payout row
-- and flips those commissions from 'pending' → 'paid', linking them by
-- payout_id so we keep an audit trail of which commissions were settled
-- in which batch.
--
-- Voiding a payout reverts its commissions back to 'pending' (the row
-- stays with status='voided' for the audit log).
create table if not exists closer_payouts (
  id uuid primary key default gen_random_uuid(),
  closer_id uuid not null references closer_accounts(id) on delete cascade,
  amount_centavos bigint not null,
  commission_count integer not null,
  slip_url text,                     -- public bucket URL of the deposit slip
  slip_filename text,
  note text,
  status text not null default 'paid' check (status in ('paid', 'voided')),
  created_by text,                   -- admin name from the session
  paid_at timestamptz not null default now(),
  voided_at timestamptz
);

create index if not exists closer_payouts_closer_idx
  on closer_payouts (closer_id, paid_at desc);
create index if not exists closer_payouts_status_idx
  on closer_payouts (status, paid_at desc);

-- Backlink: each commission knows which payout it belongs to (if any).
-- on delete set null = if a payout row is hard-deleted (we use void
-- instead), the commissions stay around as orphan-paid.
alter table closer_commissions
  add column if not exists payout_id uuid references closer_payouts(id) on delete set null;

create index if not exists closer_commissions_payout_idx on closer_commissions (payout_id);
