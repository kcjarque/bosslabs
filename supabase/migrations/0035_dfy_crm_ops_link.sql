-- Link a DFY CRM card to its DFY Ops project.
--
-- When a CRM card lands on the "Onboarding" stage — either by drag-drop or
-- by auto-advance on final payment — we spin up a matching card on the DFY
-- Ops kanban (lane='lite') and stash its id back here. That way the CRM
-- card can jump the user straight into the delivery board, and re-runs of
-- the stage transition are idempotent (don't spawn duplicates).
alter table dfy_crm_cards
  add column if not exists dfy_ops_project_id uuid
  references dfy_projects(id) on delete set null;

create index if not exists dfy_crm_ops_project_idx
  on dfy_crm_cards (dfy_ops_project_id);
