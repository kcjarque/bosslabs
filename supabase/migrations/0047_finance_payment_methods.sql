-- Payment methods for expenses (Credit Card / Cash / Bank Transfer / ...).
-- Mirrors finance_payers: a persistent, admin-managed list that the "Add
-- single expense" form's inline "+ Add payment method" also writes to.
create table if not exists finance_payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into finance_payment_methods (name) values ('Credit Card'), ('Cash'), ('Bank Transfer')
on conflict (name) do nothing;

alter table finance_expenses add column if not exists payment_method text;
