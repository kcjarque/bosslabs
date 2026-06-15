-- DFY deal/payment tracking — mirrors the VCR retreat board. amount_centavos
-- (already present) is the contract price; payments logs cash collected; paid_at
-- stamps when fully collected. "DFY income" = sum of payments. (Applied to cloud
-- via the management API.)
alter table dfy_crm_cards
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists paid_at timestamptz;
