-- People who can front (abono) an expense. This was a hardcoded ['Kyle','Mikey']
-- constant; now it's an editable table so the team can add a new person who is
-- then selectable in EVERY expense form (single / project / recurring) and
-- managed on the Finance settings page. Mirrors finance_categories.
-- (Applied to cloud via the management API.)
create table if not exists finance_payers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Seed the two existing payers so nothing changes for prior expenses.
insert into finance_payers (name) values ('Kyle'), ('Mikey')
on conflict (name) do nothing;
