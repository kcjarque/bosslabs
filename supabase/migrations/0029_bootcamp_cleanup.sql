-- AI Founder's Bootcamp — schema cleanup after the post-launch code-review fixes.
--   1. Drop the dead 'single_promo' value from the tier CHECK (the webinar-code
--      tier was removed; the TS enum no longer emits it).
--   2. Add processed_invoice_ids text[] so the Xendit webhook can apply a
--      second (balance) payment without double-counting or being silently
--      dropped by the previous status='paid' idempotency guard.

alter table bootcamp_reservations
  drop constraint if exists bootcamp_reservations_tier_check;

alter table bootcamp_reservations
  add constraint bootcamp_reservations_tier_check
  check (tier in ('single','group3','group5'));

alter table bootcamp_reservations
  add column if not exists processed_invoice_ids text[] not null default array[]::text[];

create index if not exists idx_bootcamp_reservations_processed
  on bootcamp_reservations using gin (processed_invoice_ids);
