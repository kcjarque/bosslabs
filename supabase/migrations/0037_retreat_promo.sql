-- Retreat promo support — lets a closer-issued, retreat-scoped promo code
-- auto-apply on the VibeCode Retreat checkout.
--
-- The discount is computed off the FULL standard price (₱75k) and recorded on
-- the reservation. It reduces the amount charged now for the 'full' and
-- 'installment' plans; for a 'reservation' (deposit) plan the deposit is
-- unchanged and the discount is carried on total_centavos so the balance
-- (collected outside the app) is honoured. total_centavos = standard − discount.
alter table retreat_reservations
  add column if not exists promo_code text,
  add column if not exists discount_centavos integer not null default 0,
  add column if not exists total_centavos integer;
