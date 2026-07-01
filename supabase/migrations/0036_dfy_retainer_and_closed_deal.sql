-- DFY CRM: recurring-retainer field + rename "Onboarding" stage → "Closed Deal".
--
-- Retainer captures the monthly recurring price (MRR) alongside the one-time
-- contract amount already tracked in amount_centavos. Nullable — plenty of
-- deals are pure one-time. The board rolls all retainer_centavos into a
-- Closed Projects MRR total.
--
-- The stage rename is a straight in-place update. Every 'onboarding' stage
-- row flips to 'closed_deal'; the constant list + labels are updated in
-- lib/dfy-stages.ts in the same commit.
alter table dfy_crm_cards
  add column if not exists retainer_centavos bigint;

update dfy_crm_cards set stage = 'closed_deal' where stage = 'onboarding';
