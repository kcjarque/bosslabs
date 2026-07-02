-- Checkout session picker: how many upcoming sessions to surface on /checkout.
-- 1 = single-session mode (hidden picker, just shows the current active event).
-- 2 = dual-session picker (radio between this week's + next week's events).
-- Graceful degrade: if the rule says 2 but only 1 upcoming event exists, the
-- picker still shows just the 1. Prevents dropping to "no sessions" when
-- next week hasn't been scheduled yet.
alter table settings
  add column if not exists checkout_sessions_visible int not null default 2
  check (checkout_sessions_visible in (1, 2));
