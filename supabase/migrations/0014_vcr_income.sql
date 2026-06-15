-- VCR (VibeCode Retreat) income tracking on the retreat CRM card.
-- Lets a manually-tagged or self-reserved prospect be marked paid (full or in
-- installments) and roll into a separate "Webinar income" / TOTAL INCOME metric
-- WITHOUT touching the ₱999 front-end ROAS or daily-sales numbers.
--
-- Apply via Supabase Dashboard → SQL Editor (project hsbowpbuqlctxeglpqyd).
alter table retreat_crm_cards
  -- The discussed full deal value (editable per close). Default ₱50,000.
  add column if not exists deal_amount_centavos integer not null default 5000000,
  -- Cash actually collected: [{ amount_centavos, at (iso), note }]. Handles
  -- partial/installment payments; "Webinar income" = sum of these by date.
  add column if not exists payments jsonb not null default '[]'::jsonb,
  -- Set when fully collected (sum(payments) >= deal_amount_centavos).
  add column if not exists paid_at timestamptz;
