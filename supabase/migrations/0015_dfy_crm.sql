-- DFY (Done-For-You) CRM — standalone kanban of service prospects.
-- Stages: discovery_call → contract_sent → follow_up → contract_signing → onboarding.
-- (Applied to cloud via the management API.)
create table if not exists dfy_crm_cards (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  note text not null default '',
  stage text not null default 'discovery_call',
  position int not null default 0,
  amount_centavos integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_dfy_crm_stage on dfy_crm_cards (stage, position);

-- Perf: indexes for the high-traffic signups reads (dashboard/customers/etc).
create index if not exists idx_signups_created_at on signups (created_at desc);
create index if not exists idx_signups_status on signups (status);
