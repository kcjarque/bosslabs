-- Abono on recurring payments. When a recurring is an abono, every occurrence
-- it generates (once due) is money owed to the payer → flows into Accounts
-- Payable. Settlement is per-occurrence: reuse the per-occurrence overrides row
-- (keyed by recurring_id + date) to record that one month was reimbursed.
-- Applied to cloud via the management API.
alter table finance_recurring
  add column if not exists is_abono boolean not null default false,
  add column if not exists paid_by text;

alter table finance_recurring_overrides
  add column if not exists abono_settled boolean not null default false,
  add column if not exists abono_settled_at timestamptz;
