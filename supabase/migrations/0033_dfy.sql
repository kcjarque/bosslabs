-- DFY (Done-For-You) Ops board. Each row is a customer's DFY engagement
-- moving through 6 lanes: MVP (Lite) → Contract Signature → MVP (Full
-- Production) → Feedback Loop → Launch → Maintenance.
--
-- Mirrors the Trilor lifecycle pattern: per-card detail with tabs (vision,
-- files, devops). signup_id is the link to the buyer for payment-status
-- pull-through. position is a float to allow inserts between cards in a
-- lane without rewriting siblings.
create table if not exists dfy_projects (
  id uuid primary key default gen_random_uuid(),
  signup_id text references signups(id) on delete set null,

  -- Display
  customer_name text not null,
  project_name text,

  -- Lane state
  lane text not null default 'lite' check (lane in (
    'lite', 'contract', 'production', 'feedback', 'launch', 'maintenance'
  )),
  position double precision not null default 0,
  archived boolean not null default false,

  -- Vision (structured + free-text; held as JSONB so we can grow the
  -- structure without another migration)
  vision jsonb not null default '{}'::jsonb,

  -- Build links surfaced in the DevOps tab
  git_url text,
  staging_url text,
  prod_url text,

  -- Build checklist — 6 lane-gates with check-off + who + when. Default
  -- seeded so the UI always has the same 6 rows regardless of project age.
  build_steps jsonb not null default '[
    {"slug":"lite_shipped",       "label":"MVP (Lite) shipped",  "checkedAt":null, "checkedBy":null},
    {"slug":"contract_signed",    "label":"Contract signed",      "checkedAt":null, "checkedBy":null},
    {"slug":"production_live",    "label":"Full Production live", "checkedAt":null, "checkedBy":null},
    {"slug":"feedback_done",      "label":"Feedback round done",  "checkedAt":null, "checkedBy":null},
    {"slug":"launched",           "label":"Launched",             "checkedAt":null, "checkedBy":null},
    {"slug":"maintenance_handoff","label":"Maintenance handover", "checkedAt":null, "checkedBy":null}
  ]'::jsonb,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dfy_projects_lane_pos_idx on dfy_projects(lane, position);
create index if not exists dfy_projects_signup_idx on dfy_projects(signup_id);
create index if not exists dfy_projects_created_idx on dfy_projects(created_at desc);

-- Threaded comments under the DevOps tab.
create table if not exists dfy_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references dfy_projects(id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists dfy_comments_project_idx on dfy_comments(project_id, created_at);

-- Files attached to a project (contracts, vision docs, screenshots, etc.)
-- Either uploaded into the `email-assets` bucket under a `dfy/{project_id}/`
-- prefix (storage_path set) OR an external URL (external_url set).
create table if not exists dfy_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references dfy_projects(id) on delete cascade,
  name text not null,
  kind text not null default 'other' check (kind in ('contract', 'vision', 'design', 'other')),
  storage_path text,
  external_url text,
  mime text,
  size_bytes bigint,
  uploaded_by text,
  uploaded_at timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);
create index if not exists dfy_files_project_idx on dfy_files(project_id, uploaded_at desc);
