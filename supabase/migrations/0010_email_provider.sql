-- Which email provider sends outbound mail. 'resend' (default) or 'ses'.
-- AWS credentials for SES live in env vars (AWS_ACCESS_KEY_ID / SECRET /
-- AWS_REGION), not the DB — same setup style as ConexMail.
alter table settings add column if not exists email_provider text not null default 'resend';
