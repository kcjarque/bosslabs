-- Saveable project proposals produced by the Proposal Maker. Sibling of the
-- contracts table (0031): each row is a full snapshot of the proposal form
-- state (modules, integrations, AI checklists, ship-log picks stored as JSONB
-- so the schema doesn't have to track their structure), plus the headline
-- investment figures so the list page can render without re-parsing JSON.
--
-- A proposal is the persuasive, plain-English pitch that precedes the legal
-- Web Development & Services Agreement (contracts). signup_id is nullable:
-- not every proposal is for a tracked customer. proposal_no is the
-- human-facing reference (PROP-YYMMDD-NN), assigned server-side on create.
create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  signup_id text references signups(id) on delete set null,
  client_company_name text not null,
  client_rep_name text,
  client_rep_position text,
  client_address text,
  platform_name text,
  client_vision text,
  proposal_no text,
  proposal_date date not null default current_date,
  validity_days int not null default 30,
  option_id text not null default 'A',
  modules jsonb not null default '[]'::jsonb,
  integrations jsonb not null default '[]'::jsonb,
  ai_phase1 jsonb not null default '[]'::jsonb,
  ai_phase2 jsonb not null default '[]'::jsonb,
  ship_log jsonb not null default '[]'::jsonb,
  kickoff_date date,
  onboarding_days int not null default 2,
  workflow_days int not null default 3,
  mvp_days int not null default 4,
  data_migration_days int not null default 7,
  implementation_days int not null default 30,
  warranty_days int not null default 60,
  training_sessions int not null default 2,
  training_mode text not null default 'either' check (training_mode in ('on-site', 'online', 'either')),
  one_time_total_centavos bigint not null default 15000000,
  monthly_retainer_centavos bigint not null default 1500000,
  min_retainer_months int not null default 6,
  exit_fee_centavos bigint not null default 10000000,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposals_signup_idx on proposals(signup_id);
create index if not exists proposals_status_idx on proposals(status);
create index if not exists proposals_created_idx on proposals(created_at desc);
create index if not exists proposals_proposal_no_idx on proposals(proposal_no);
