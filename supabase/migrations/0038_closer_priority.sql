-- Priority flag for the closer upsell pool. A priority signup floats to the top
-- of the pool and renders as a highlighted "priority" card — used to surface hot
-- retreat leads (e.g. people who joined the VibeCode Retreat breakout on a
-- webinar). Priority signups appear in the pool even if they haven't paid yet.
create table if not exists closer_priority_signups (
  signup_id text primary key references signups(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);
