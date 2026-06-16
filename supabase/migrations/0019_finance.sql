-- Finance tab — expense tracking, BOM-style projects, recurring payments,
-- configurable categories. All money in centavos (bigint). Applied to cloud via
-- the management API.
--
-- Model:
--   finance_categories     — Salary / Subscriptions / Tools (+ user-added)
--   finance_projects       — a job/initiative with a budget
--   finance_project_items  — BOM line items (budgeted) under a project
--   finance_expenses       — actual money out: single entries OR project-tagged
--                            (recurring occurrences are computed on the fly per
--                             month, NOT stored here)
--   finance_recurring      — recurring payment definitions (monthly/weekly)

create table if not exists finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists finance_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists finance_project_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references finance_projects(id) on delete cascade,
  name text not null,
  budget_centavos bigint not null default 0,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists finance_recurring (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount_centavos bigint not null default 0,
  category_id uuid references finance_categories(id) on delete set null,
  cadence text not null default 'monthly',          -- 'monthly' | 'weekly'
  credit_day int not null default 1,                -- monthly: 1-31 ; weekly: 0(Sun)-6(Sat)
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists finance_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount_centavos bigint not null default 0,
  category_id uuid references finance_categories(id) on delete set null,
  spent_on date not null default current_date,
  project_id uuid references finance_projects(id) on delete set null,
  project_item_id uuid references finance_project_items(id) on delete set null,
  source text not null default 'single',            -- 'single' | 'project'
  created_at timestamptz not null default now()
);

create index if not exists finance_expenses_spent_on_idx on finance_expenses(spent_on);
create index if not exists finance_expenses_project_idx on finance_expenses(project_id);
create index if not exists finance_project_items_project_idx on finance_project_items(project_id);

-- Seed the three starter categories the user named (idempotent).
insert into finance_categories (name) values ('Salary'), ('Subscriptions'), ('Tools')
on conflict (name) do nothing;
