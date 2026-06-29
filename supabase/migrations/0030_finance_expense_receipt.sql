-- Add optional receipt/screenshot URL to expense rows.
-- Stored in the existing email-assets bucket under the receipts/ key prefix.
-- Nullable: pre-existing rows + future "no receipt" entries still work.
alter table finance_expenses
  add column if not exists receipt_url text;
