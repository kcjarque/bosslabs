-- Link auto-created expense rows back to the closer payout that spawned them.
--
-- When an admin settles a closer's commissions (createCloserPayout), we mirror
-- the payout into the expense ledger under "Salary" with the deposit slip as
-- the receipt. This backlink makes that mirror (a) idempotent — one expense
-- per payout — and (b) reversible: voiding a payout deletes its expense so the
-- P&L doesn't double-count a payment that was undone.
alter table finance_expenses
  add column if not exists payout_id uuid references closer_payouts(id) on delete set null;

create unique index if not exists finance_expenses_payout_key
  on finance_expenses (payout_id) where payout_id is not null;
