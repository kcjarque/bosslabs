-- How long a closer may hold a claimed lead before it auto-releases back to
-- the pool (Unassigned / "New") for re-assignment. Editable in admin → Closers.
alter table settings add column if not exists closer_claim_hold_hours numeric not null default 6;
