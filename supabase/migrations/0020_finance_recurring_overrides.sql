-- Per-occurrence overrides for recurring payments. Recurring items are still
-- computed live each month; this table layers exceptions on top of a single
-- occurrence (identified by its date) without materializing every month:
--   amount_centavos set  → that month's amount is corrected
--   skipped = true        → that month's occurrence is removed from Expenses
-- Applied to cloud via the management API.
create table if not exists finance_recurring_overrides (
  id uuid primary key default gen_random_uuid(),
  recurring_id uuid not null references finance_recurring(id) on delete cascade,
  occurrence_date date not null,
  amount_centavos bigint,            -- null = no amount override (skip-only)
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  unique (recurring_id, occurrence_date)
);

create index if not exists finance_recurring_overrides_date_idx
  on finance_recurring_overrides(occurrence_date);
