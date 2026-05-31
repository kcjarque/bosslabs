-- Order-bump CRM: a kanban board of people to follow up with via SMS.
create table if not exists crm_cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text default '',
  email text default '',
  note text default '',
  stage text not null default 'new',
  position integer not null default 0,
  signup_id text,                       -- optional link to a signup (import dedup)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_crm_cards_stage on crm_cards (stage, position);
create unique index if not exists uq_crm_signup on crm_cards (signup_id) where signup_id is not null;

create table if not exists crm_config (
  id integer primary key default 1,
  sms_template text default 'Hi {{name}}! Quick one — want me to add the upgrade to your webinar order? 😊'
);
insert into crm_config (id) values (1) on conflict (id) do nothing;
