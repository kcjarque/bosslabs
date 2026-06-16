-- Abono (reimbursable advance) tracking on expenses. When someone (Kyle/Mikee)
-- fronts an expense, flag it as an abono + record who paid. Unsettled abonos
-- form Accounts Payable (what the business owes that person); marking it settled
-- reimburses them and drops it from AP. The expense/cost itself is unchanged.
-- Applied to cloud via the management API.
alter table finance_expenses
  add column if not exists is_abono boolean not null default false,
  add column if not exists paid_by text,
  add column if not exists abono_settled boolean not null default false,
  add column if not exists abono_settled_at timestamptz;

create index if not exists finance_expenses_abono_idx
  on finance_expenses(is_abono, abono_settled);
