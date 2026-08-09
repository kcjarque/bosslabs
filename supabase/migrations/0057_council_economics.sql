-- 0057_council_economics.sql — profit anchor (spec §3h). Idempotent, additive.
-- The ONLY storage change in Prince Analysis v2; everything else is live/derived.
alter table council_settings
  add column if not exists target_roas numeric not null default 2.0,
  add column if not exists breakeven_roas numeric not null default 1.04,
  add column if not exists processing_fee_pct numeric not null default 0.035,
  add column if not exists daily_net_target_centavos bigint not null default 5000000,
  add column if not exists back_end_note text not null default '';

-- Bring the BOSS CPP ceiling to ₱650 only if it is still the old ₱500 default.
update council_settings set target_cpp_centavos = 65000
  where brand = 'BOSS' and target_cpp_centavos = 50000;
