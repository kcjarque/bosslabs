-- Saveable contracts produced by the Contract Maker. Each row is a full
-- snapshot of the form state (line items as JSONB so the schema doesn't
-- have to track each option's structure), plus the computed one-time +
-- monthly totals so the customer-profile LTV calc + the list page can
-- aggregate without re-parsing line_items every read.
--
-- signup_id is nullable: not every contract is for a tracked customer.
-- When set, the customer profile page shows the contract under the
-- "Contracts" section and rolls its value into LTV.
create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  signup_id text references signups(id) on delete set null,
  client_company_name text not null,
  client_rep_name text,
  client_rep_position text,
  client_address text,
  effective_date date not null default current_date,
  option_id text not null,
  line_items jsonb not null default '[]'::jsonb,
  governing_venue text,
  requires_downpayment boolean not null default true,
  downpayment_mode text not null default 'percent' check (downpayment_mode in ('percent', 'fixed')),
  downpayment_percent int check (downpayment_percent is null or (downpayment_percent between 1 and 99)),
  downpayment_fixed_centavos bigint check (downpayment_fixed_centavos is null or downpayment_fixed_centavos >= 0),
  one_time_total_centavos bigint not null default 0,
  monthly_total_centavos bigint not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contracts_signup_idx on contracts(signup_id);
create index if not exists contracts_status_idx on contracts(status);
create index if not exists contracts_created_idx on contracts(created_at desc);
