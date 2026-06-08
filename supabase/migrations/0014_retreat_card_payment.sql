-- 0014_retreat_card_payment.sql
-- VibeCode Retreat card payments now go through a dynamic Xendit invoice
-- (amount = the plan's due-now), and the Xendit webhook auto-confirms the
-- reservation. Track the paid timestamp + the Xendit invoice id so the
-- confirmation is idempotent and auditable. status moves to 'paid' on a
-- successful card charge (vs 'proof_submitted' for the manual bank-transfer
-- proof flow).
alter table retreat_reservations
  add column if not exists paid_at timestamptz,
  add column if not exists xendit_invoice_id text;
