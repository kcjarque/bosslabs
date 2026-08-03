-- Add two non-delivery lanes to DFY Ops: `keep_warm` and `lost_lead`.
--
-- The original 0033_dfy.sql defined `dfy_projects.lane` with an inline CHECK
-- (unnamed). Inline CHECKs get an auto-generated name, so we drop by lookup
-- rather than guessing at `dfy_projects_lane_check` — safer across restores
-- and reruns.
--
-- Note: `dfy_crm_cards.stage` intentionally has NO CHECK constraint (see
-- 0015_dfy_crm.sql), so the CRM's new `keep_warm` stage needs only the
-- TypeScript update in lib/dfy-stages.ts — no DB change here.
do $$
declare
  con text;
begin
  select conname into con
  from pg_constraint
  where conrelid = 'public.dfy_projects'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%lane%';
  if con is not null then
    execute format('alter table public.dfy_projects drop constraint %I', con);
  end if;
end $$;

alter table public.dfy_projects
  add constraint dfy_projects_lane_check
  check (lane in (
    'lite', 'contract', 'production', 'feedback', 'launch', 'maintenance',
    'keep_warm', 'lost_lead'
  ));
