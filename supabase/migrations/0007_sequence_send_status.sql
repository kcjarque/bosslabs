-- Sequence-send delivery tracking.
--
-- Until now sequence_sends only recorded email_ok / sms_ok (did the provider
-- accept the send), so automated/list emails showed no "Delivered" badge in
-- the comms timeline — unlike admin sends, which store the Resend message id
-- and get lifecycle updates from the /api/webhooks/resend handler.
--
-- Add the same three fields so a sequence email can be matched back from a
-- Resend webhook and stamped delivered / bounced / opened, etc.

alter table sequence_sends
  add column if not exists email_message_id text,
  add column if not exists email_status text,
  add column if not exists email_status_at timestamptz;

-- Webhook matches on the Resend message id; partial index keeps it lean.
create index if not exists sequence_sends_email_message_id_idx
  on sequence_sends (email_message_id)
  where email_message_id is not null;
