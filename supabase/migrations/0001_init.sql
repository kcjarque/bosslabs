-- BOSSLABS AI — initial schema for signups, templates, settings.
--
-- Run this once in your Supabase project (SQL editor → New query → paste → Run).
-- Idempotent: safe to re-run; uses IF NOT EXISTS + ON CONFLICT.

-- ─── Tables ───────────────────────────────────────────────────────────────

create table if not exists signups (
  id text primary key,
  first_name text not null,
  last_name text,
  email text not null,
  phone text not null default '',
  source text not null check (source in ('free', 'paid', 'contact')),
  status text not null default 'registered'
    check (status in ('registered', 'paid', 'attended', 'no-show', 'refunded', 'unsubscribed')),
  amount_centavos integer,
  bumped boolean default false,
  message text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists signups_created_at_idx on signups (created_at desc);
create index if not exists signups_email_idx on signups (email);
create index if not exists signups_source_idx on signups (source);

create table if not exists email_templates (
  id text primary key,
  name text not null,
  subject text not null,
  html text not null,
  updated_at timestamptz not null default now()
);

create table if not exists sms_templates (
  id text primary key,
  name text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

create table if not exists settings (
  id integer primary key default 1,
  webinar_name text default 'AI Coding 101 — The BOSSLABS AI Webinar',
  webinar_date text default 'To Be Announced',
  webinar_time text default '8:00 PM',
  webinar_timezone text default 'PHT',
  webinar_starts_at_iso text default '',
  resend_api_key text default '',
  resend_from_email text default 'hello@bosslabs.ai',
  resend_from_name text default 'BOSSLABS AI',
  resend_reply_to text default 'hello@bosslabs.ai',
  onewaysms_endpoint text default 'https://gateway.onewaysms.com.ph:10443/api.aspx',
  onewaysms_username text default '',
  onewaysms_password text default '',
  onewaysms_sender_id text default 'BOSSLABS',
  zoom_register_url text default '',
  zoom_join_url text default '',
  replay_url text default '',
  messenger_group_url text default '',
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- Idempotent add-columns for projects already scaffolded on an older schema.
alter table settings add column if not exists webinar_name text default 'AI Coding 101 — The BOSSLABS AI Webinar';
alter table settings add column if not exists webinar_date text default 'To Be Announced';
alter table settings add column if not exists webinar_time text default '8:00 PM';
alter table settings add column if not exists webinar_timezone text default 'PHT';
alter table settings add column if not exists webinar_starts_at_iso text default '';
alter table settings add column if not exists resend_reply_to text default 'hello@bosslabs.ai';

-- ─── Promo codes ──────────────────────────────────────────────────────────
-- Discount engine for the public checkout. Codes can be:
--   - 'free'    → full waiver of the order total (discount_value ignored)
--   - 'percent' → discount_value is 1-100 (e.g. 20 = 20% off the total)
--   - 'fixed'   → discount_value is centavos (e.g. 50000 = ₱500 off)
-- A code is redeemable when: active = true, expires_at IS NULL OR > now(),
-- and (max_uses IS NULL OR uses_count < max_uses). Redemption increments
-- uses_count atomically via the redeem_promo_code() function below so two
-- concurrent buyers can't both burn the last seat of a 1-use code.
create table if not exists promo_codes (
  code text primary key,
  discount_type text not null check (discount_type in ('free', 'percent', 'fixed')),
  discount_value integer not null default 0,
  max_uses integer,
  uses_count integer not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists promo_codes_active_idx on promo_codes (active);

alter table promo_codes enable row level security;
-- (No anon policies — service-role bypasses RLS.)

-- Atomic redemption. Returns the row when the redemption succeeded
-- (uses_count incremented by 1). Returns no rows when the code is
-- missing/expired/exhausted/disabled — the caller treats that as
-- "invalid code, refuse the redemption".
create or replace function redeem_promo_code(p_code text)
returns setof promo_codes
language sql
as $$
  update promo_codes
     set uses_count = uses_count + 1
   where code = p_code
     and active = true
     and (expires_at is null or expires_at > now())
     and (max_uses is null or uses_count < max_uses)
   returning *;
$$;

-- ─── Row Level Security ───────────────────────────────────────────────────
-- The Next.js server uses the service-role key, which bypasses RLS. We enable
-- RLS so the anon key (if ever leaked) has zero read/write access.

alter table signups enable row level security;
alter table email_templates enable row level security;
alter table sms_templates enable row level security;
alter table settings enable row level security;

-- (No policies are defined — anon is locked out by default. Service-role
--  bypasses RLS at the database level.)

-- ─── Seed email templates ─────────────────────────────────────────────────
insert into email_templates (id, name, subject, html) values
('free_welcome',
 'Free Registration Welcome',
 'You''re in, {{firstName}} — your Zoom link is below',
 '<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0B0D12"><p style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#0093B8;margin:0 0 12px">BOSSLABS AI · You''re in</p><h1 style="font-family:Georgia,serif;font-weight:400;font-size:36px;line-height:1.1;margin:0 0 16px">Welcome, {{firstName}}.</h1><p style="font-size:16px;line-height:1.55;margin:0 0 16px">Your seat for the BOSSLABS AI Webinar is locked in. Save the date and bring one workflow you want to automate.</p><p style="font-size:16px;line-height:1.55;margin:0 0 24px"><strong>{{webinarDate}} · {{webinarTime}} {{webinarTimezone}}</strong></p><p style="margin:0 0 24px"><a href="{{zoomJoinUrl}}" style="background:#00B8E6;color:#06070A;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Join the Zoom call</a></p><p style="font-size:14px;line-height:1.5;color:#454A57;margin:0 0 8px">One more step — unlock your Free Gift by joining the Messenger group:</p><p style="margin:0 0 32px"><a href="{{messengerGroupUrl}}" style="color:#0093B8">Join the BOSSLABS Messenger Group →</a></p><p style="font-size:12px;color:#6B6F7C">— Mikee &amp; Kyle<br>BOSSLABS AI · Built in Manila</p></div>'
),
('paid_confirmation',
 'Paid Ticket Confirmation',
 'Ticket confirmed — see you on {{webinarDate}}',
 '<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0B0D12"><p style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#0093B8;margin:0 0 12px">Payment received · Seat locked</p><h1 style="font-family:Georgia,serif;font-weight:400;font-size:36px;line-height:1.1;margin:0 0 16px">Thanks, {{firstName}}.</h1><p style="font-size:16px;line-height:1.55;margin:0 0 16px">Your BOSSLABS AI ticket is locked in.</p><p style="font-size:16px;line-height:1.55;margin:0 0 24px"><strong>Live on Zoom · {{webinarDate}} · {{webinarTime}} {{webinarTimezone}}</strong></p><p style="margin:0 0 24px"><a href="{{zoomJoinUrl}}" style="background:#00B8E6;color:#06070A;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Join the Zoom call</a></p><p style="font-size:14px;line-height:1.55;margin:0 0 8px"><strong>What''s included</strong></p><ul style="font-size:14px;line-height:1.7;margin:0 0 24px;padding-left:20px"><li>Claude Code Skills pack (configs, prompts, and reusable skills)</li><li>Founder Workflow Audit Checklist</li><li>7-day Zoom replay access</li><li>BOSSLABS Community access (Messenger + ongoing Q&amp;A)</li></ul><p style="font-size:14px;line-height:1.55;color:#454A57;margin:0 0 8px">Join the BOSSLABS Messenger group for reminders + post-event Q&amp;A:</p><p style="margin:0 0 32px"><a href="{{messengerGroupUrl}}" style="color:#0093B8">Join the Messenger Group →</a></p><p style="font-size:12px;color:#6B6F7C">— Mikee &amp; Kyle</p></div>'
),
('reminder_24h',
 '24-Hour Reminder',
 'Tomorrow at {{webinarTime}} — BOSSLABS AI Webinar',
 '<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0B0D12"><p style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#0093B8;margin:0 0 12px">24-hour reminder</p><h1 style="font-family:Georgia,serif;font-weight:400;font-size:32px;line-height:1.15;margin:0 0 16px">See you tomorrow, {{firstName}}.</h1><p style="font-size:16px;line-height:1.55;margin:0 0 16px">The webinar goes live <strong>{{webinarDate}} at {{webinarTime}} {{webinarTimezone}}</strong>. Show up 5 minutes early. Bring one workflow to automate.</p><p style="margin:0 0 24px"><a href="{{zoomJoinUrl}}" style="background:#00B8E6;color:#06070A;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Join the Zoom call</a></p></div>'
),
('reminder_1h',
 '1-Hour Reminder',
 'Starting in 1 hour — {{webinarTime}} PHT',
 '<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0B0D12"><p style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#B61E1E;margin:0 0 12px">Starts in 1 hour</p><h1 style="font-family:Georgia,serif;font-weight:400;font-size:32px;line-height:1.15;margin:0 0 16px">{{firstName}}, the doors open in 60 minutes.</h1><p style="font-size:16px;line-height:1.55;margin:0 0 24px">Grab your laptop, open Zoom, and meet us 5 minutes before {{webinarTime}}.</p><p style="margin:0 0 24px"><a href="{{zoomJoinUrl}}" style="background:#00B8E6;color:#06070A;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Join the Zoom call</a></p></div>'
),
('replay',
 'Replay Available (7-day window)',
 'Replay is up — 7 days only, {{firstName}}',
 '<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0B0D12"><p style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#0093B8;margin:0 0 12px">Replay · 7-day window</p><h1 style="font-family:Georgia,serif;font-weight:400;font-size:32px;line-height:1.15;margin:0 0 16px">Watch it again — or for the first time.</h1><p style="font-size:16px;line-height:1.55;margin:0 0 24px">Here''s your replay. After 7 days it comes down, so block off some time this week.</p><p style="margin:0 0 24px"><a href="{{replayUrl}}" style="background:#00B8E6;color:#06070A;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Watch the replay</a></p></div>'
)
on conflict (id) do update
  set name = excluded.name,
      subject = excluded.subject,
      html = excluded.html,
      updated_at = now();

-- ─── Seed SMS templates ───────────────────────────────────────────────────
insert into sms_templates (id, name, body) values
('free_welcome',
 'Free Registration Welcome',
 'Hi {{firstName}}! You''re in for BOSSLABS AI. Save the date {{webinarDate}} at {{webinarTime}}. Join the Messenger group for your free gift: {{messengerGroupUrl}}'
),
('paid_confirmation',
 'Paid Ticket Confirmation',
 'BOSSLABS AI: Payment received. {{firstName}}, your seat is locked in for {{webinarDate}} at {{webinarTime}}. Zoom: {{zoomJoinUrl}}'
),
('reminder_24h',
 '24-Hour Reminder',
 'BOSSLABS AI: Hi {{firstName}}! Tomorrow at {{webinarTime}} {{webinarTimezone}}. Join: {{zoomJoinUrl}}'
),
('reminder_1h',
 '1-Hour Reminder',
 'BOSSLABS AI starts in 1 hour, {{firstName}}. Open Zoom: {{zoomJoinUrl}}'
),
('replay',
 'Replay Available',
 'BOSSLABS AI replay is up for 7 days. Watch this week: {{replayUrl}}'
)
on conflict (id) do update
  set name = excluded.name,
      body = excluded.body,
      updated_at = now();
