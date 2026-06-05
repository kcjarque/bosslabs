-- VibeCode Retreat CRM — a kanban of retreat leads, fed by retreat_reservations
-- (reserved → Interested, paid/proof_submitted → auto-advanced to Paid) plus
-- manually-promoted people. Mirrors the order-bump CRM (crm_cards).

create table if not exists retreat_crm_cards (
  id uuid primary key default gen_random_uuid(),
  -- Linked reservation (one card per reservation). Null for manually-added
  -- "interested" people who haven't reserved yet.
  reservation_id uuid unique references retreat_reservations(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  stage text not null default 'interested',
  position int not null default 0,
  note text not null default '',
  created_at timestamptz not null default now()
);
