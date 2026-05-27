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
  body text,
  updated_at timestamptz not null default now()
);
-- Existing projects: backfill the column if the table predates the body field.
alter table email_templates add column if not exists body text;

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

-- ─── Recovery email status upgrade (race-safe) ────────────────────────────
-- Resend fires email.sent and email.delivered for the same email within
-- milliseconds. The webhook handler used to do a read-modify-write that
-- raced under Vercel's concurrent function instances — two events could
-- both read currentStatus=null, both pass the rank check, and whichever
-- wrote LAST won (often leaving status='sent' even when 'delivered' had
-- arrived).
--
-- This function does the check + update atomically: the rank comparison
-- lives inside the WHERE clause, so Postgres's row-level locking
-- prevents the second update from seeing stale state. Idempotent —
-- replays of the same event are no-ops because new_rank > current_rank
-- is false the second time.
create or replace function upgrade_recovery_email_status(
  p_signup_id text,
  p_new_status text,
  p_new_status_at timestamptz,
  p_bounce_message text default null
) returns void
language plpgsql
as $$
declare
  v_new_rank int;
begin
  v_new_rank := case p_new_status
    when 'sent' then 1
    when 'delivered' then 2
    when 'opened' then 3
    when 'clicked' then 4
    when 'bounced' then 10
    when 'complained' then 10
    else 0
  end;

  update signups
  set metadata = metadata
    || jsonb_build_object(
      'recoveryEmailStatus', p_new_status,
      'recoveryEmailStatusAt', p_new_status_at
    )
    || (case when p_bounce_message is not null
        then jsonb_build_object('recoveryEmailBounce', p_bounce_message)
        else '{}'::jsonb end)
  where id = p_signup_id
  and v_new_rank > (case coalesce(metadata->>'recoveryEmailStatus', '')
      when 'sent' then 1
      when 'delivered' then 2
      when 'opened' then 3
      when 'clicked' then 4
      when 'bounced' then 10
      when 'complained' then 10
      else 0
    end);
end;
$$;

-- ─── Page views ───────────────────────────────────────────────────────────
-- Lightweight homegrown traffic tracker. The PageviewTracker client
-- component beacons one row per page mount; the admin dashboard reads
-- aggregate counts to compute the Visits → Checkout → Paid funnel.
--
-- We index session_id so we can do distinct-session counts cheaply
-- (e.g. "unique visitors to /checkout in the last 24h"). The session_id
-- is a browser-local UUID set on first visit, so it counts unique
-- browsers, not unique humans — good enough at our scale.
create table if not exists page_views (
  id bigserial primary key,
  path text not null,
  session_id text,
  referrer text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists page_views_path_idx on page_views (path);
create index if not exists page_views_created_at_idx on page_views (created_at desc);
create index if not exists page_views_session_id_idx on page_views (session_id);

alter table page_views enable row level security;
-- (No anon policies — service-role bypasses RLS.)

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
 '<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0B0D12"><p style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#0093B8;margin:0 0 12px">BOSSLABS AI · You''re in</p><h1 style="font-family:Georgia,serif;font-weight:400;font-size:36px;line-height:1.1;margin:0 0 16px">Welcome, {{firstName}}.</h1><p style="font-size:16px;line-height:1.55;margin:0 0 16px">Your seat for the BOSSLABS AI Webinar is locked in. Save the date and bring one workflow you want to automate.</p><p style="font-size:16px;line-height:1.55;margin:0 0 24px"><strong>{{webinarDate}} · {{webinarTime}} {{webinarTimezone}}</strong></p><p style="margin:0 0 24px"><a href="{{zoomJoinUrl}}" style="background:#00B8E6;color:#06070A;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Join the Zoom call</a></p><p style="font-size:14px;line-height:1.5;color:#454A57;margin:0 0 8px">One more step — unlock your Free Gift by joining the Messenger group:</p><p style="margin:0 0 32px"><a href="{{messengerGroupUrl}}" style="color:#0093B8">Join the BOSSLABS Messenger Group →</a></p><p style="font-size:12px;color:#6B6F7C">— Mikey<br>BOSSLABS AI · Built in Manila</p></div>'
),
('paid_confirmation',
 'Paid Ticket Confirmation',
 'Ticket confirmed — see you on {{webinarDate}}',
 '<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0B0D12"><p style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#0093B8;margin:0 0 12px">Payment received · Seat locked</p><h1 style="font-family:Georgia,serif;font-weight:400;font-size:36px;line-height:1.1;margin:0 0 16px">Thanks, {{firstName}}.</h1><p style="font-size:16px;line-height:1.55;margin:0 0 16px">Your BOSSLABS AI ticket is locked in.</p><p style="font-size:16px;line-height:1.55;margin:0 0 24px"><strong>Live on Zoom · {{webinarDate}} · {{webinarTime}} {{webinarTimezone}}</strong></p><p style="margin:0 0 24px"><a href="{{zoomJoinUrl}}" style="background:#00B8E6;color:#06070A;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Join the Zoom call</a></p><p style="font-size:14px;line-height:1.55;margin:0 0 8px"><strong>What''s included</strong></p><ul style="font-size:14px;line-height:1.7;margin:0 0 24px;padding-left:20px"><li>Claude Code Skills pack (configs, prompts, and reusable skills)</li><li>Founder Workflow Audit Checklist</li><li>7-day Zoom replay access</li><li>BOSSLABS Community access (Messenger + ongoing Q&amp;A)</li></ul><p style="font-size:14px;line-height:1.55;color:#454A57;margin:0 0 8px">Join the BOSSLABS Messenger group for reminders + post-event Q&amp;A:</p><p style="margin:0 0 32px"><a href="{{messengerGroupUrl}}" style="color:#0093B8">Join the Messenger Group →</a></p><p style="font-size:12px;color:#6B6F7C">— Mikey</p></div>'
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

-- ─── Backfill markdown body for the seed templates ────────────────────────
-- The text editor opens any template whose body is non-null. We only
-- backfill rows where body is currently null so we never clobber edits
-- the admin has already made in the text editor.
update email_templates set body = $$^^BOSSLABS AI · You're in^^

# Welcome, {{firstName}}.

Your seat for the BOSSLABS AI Webinar is locked in. Save the date and bring one workflow you want to automate.

**{{webinarDate}} · {{webinarTime}} {{webinarTimezone}}**

[[Join the Zoom call]]({{zoomJoinUrl}})

One more step — unlock your Free Gift by joining the Messenger group:

[Join the BOSSLABS Messenger Group →]({{messengerGroupUrl}})

— Mikey
BOSSLABS AI · Built in Manila$$
where id = 'free_welcome' and body is null;

update email_templates set body = $$^^Payment received · Seat locked^^

# Thanks, {{firstName}}.

Your BOSSLABS AI ticket is locked in.

**Live on Zoom · {{webinarDate}} · {{webinarTime}} {{webinarTimezone}}**

[[Join the Zoom call]]({{zoomJoinUrl}})

## What's included

Claude Code Skills pack (configs, prompts, and reusable skills). Founder Workflow Audit Checklist. 7-day Zoom replay access. BOSSLABS Community access (Messenger + ongoing Q&A).

Join the BOSSLABS Messenger group for reminders + post-event Q&A:

[Join the Messenger Group →]({{messengerGroupUrl}})

— Mikey$$
where id = 'paid_confirmation' and body is null;

update email_templates set body = $$^^24-hour reminder^^

# See you tomorrow, {{firstName}}.

The webinar goes live **{{webinarDate}} at {{webinarTime}} {{webinarTimezone}}**. Show up 5 minutes early. Bring one workflow to automate.

[[Join the Zoom call]]({{zoomJoinUrl}})$$
where id = 'reminder_24h' and body is null;

update email_templates set body = $$^^Starts in 1 hour^^

# {{firstName}}, the doors open in 60 minutes.

Grab your laptop, open Zoom, and meet us 5 minutes before {{webinarTime}}.

[[Join the Zoom call]]({{zoomJoinUrl}})$$
where id = 'reminder_1h' and body is null;

update email_templates set body = $$^^Replay · 7-day window^^

# Watch it again — or for the first time.

Here's your replay. After 7 days it comes down, so block off some time this week.

[[Watch the replay]]({{replayUrl}})$$
where id = 'replay' and body is null;

-- Recovery template that referenced from the admin recover-payment route.
-- Seeded with body so it opens cleanly in the text editor. Inserts (not
-- upserts) so an admin who has already created their own version isn't
-- overwritten.
insert into email_templates (id, name, subject, html, body) values
('payment_recovery',
 'Payment Recovery (stuck buyer)',
 'Finish your BOSSLABS AI seat — link inside',
 '',
 $$^^Finish your checkout^^

# Hey {{firstName}} —

We noticed your BOSSLABS AI payment didn't go through. Your invoice is still live for a few hours, so you can pick up where you left off:

[[Resume payment]]({{invoiceUrl}})

Common gotcha: the GCash QR code on the next page expires in 60 seconds. If you're on mobile, tap the link above and confirm directly in your GCash app instead of screenshotting the QR.

Stuck? Hit reply — we read every email.

— Mikey$$
)
on conflict (id) do nothing;

-- ─── Reminder sequence templates (60h / 48h / 36h / 12h) ─────────────────
-- The 24h and 1h templates already exist above. These 4 fill out the
-- six-step pre-webinar sequence fired by /api/cron/send-reminders.
-- on conflict do nothing so admin edits in the markdown editor survive
-- re-runs of this migration.
insert into email_templates (id, name, subject, html, body) values
('reminder_60h',
 '60-hour reminder',
 'Your BOSSLABS AI seat — 2.5 days out',
 '',
 $$^^60-hour reminder^^

# See you in 2.5 days, {{firstName}}.

We&rsquo;re live **{{webinarDate}} at {{webinarTime}} {{webinarTimezone}}**. Drop it on your calendar so nothing pushes it.

Bring one workflow you want AI to automate — that&rsquo;s what we&rsquo;ll build during the call.

[[Add to calendar / Open Zoom]]({{zoomJoinUrl}})

— Mikey$$
),
('reminder_48h',
 '48-hour reminder',
 '2 days to BOSSLABS AI — block your calendar',
 '',
 $$^^48-hour reminder^^

# 2 days out, {{firstName}}.

Webinar lands **{{webinarDate}} at {{webinarTime}} {{webinarTimezone}}**. If you haven&rsquo;t added it to your calendar yet, do it now — meetings have a way of stacking on the day-of.

[[Open the Zoom link]]({{zoomJoinUrl}})

Want extra context before the call? Browse the Messenger group:

[Join the BOSSLABS Messenger Group →]({{messengerGroupUrl}})

— Mikey$$
),
('reminder_36h',
 '36-hour reminder',
 'Day after tomorrow — see you on Zoom',
 '',
 $$^^36-hour reminder^^

# Day after tomorrow, {{firstName}}.

Almost game time. The webinar goes live **{{webinarDate}} at {{webinarTime}} {{webinarTimezone}}**.

Quick prep:
- One workflow you&rsquo;d love AI to take off your plate
- A laptop (not just a phone — we&rsquo;re live-building)
- 5 minutes early so we start on time

[[Join the Zoom call]]({{zoomJoinUrl}})

— Mikey$$
),
('reminder_12h',
 '12-hour reminder',
 '12 hours out — final prep',
 '',
 $$^^12-hour reminder^^

# {{firstName}}, the doors open in 12 hours.

Final stretch. Webinar goes live **{{webinarDate}} at {{webinarTime}} {{webinarTimezone}}** — that&rsquo;s tonight (or first thing tomorrow depending on your timezone).

[[Open the Zoom call]]({{zoomJoinUrl}})

— Mikey$$
)
on conflict (id) do nothing;

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

-- ─── Session recordings (rrweb) ──────────────────────────────────────────
alter table settings add column if not exists recording_enabled boolean default false;

create table if not exists session_recordings (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  page text not null,
  events jsonb not null default '[]'::jsonb,
  size_bytes integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_recordings_created on session_recordings (created_at desc);
alter table session_recordings enable row level security;

create or replace function sum_recording_bytes()
returns bigint language sql stable as $$
  select coalesce(sum(size_bytes), 0) from session_recordings;
$$;

-- ─── Telegram bot notifications ──────────────────────────────────────────
alter table settings add column if not exists telegram_bot_token text default '';
alter table settings add column if not exists telegram_chat_id text default '';

-- ─── Email sequence engine ───────────────────────────────────────────────
-- Generalized version of the hardcoded 6-window reminder cron.
--   events       — webinars (current + future). Sequences anchor here.
--   lists        — saved filters across signups (e.g. "all paid").
--   sequences    — series of emails attached to a list, anchored to an event.
--   sequence_steps — individual emails in a sequence (template + offset).
--   sequence_sends — log of every send (idempotency).

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at_iso text not null,         -- ISO 8601 with TZ
  timezone text not null default 'Asia/Manila',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists events_active_idx on events (active);

create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  -- LEGACY single-filter column. Kept for backward compat; new code reads filter_types[].
  -- May be null on rows created after the multi-filter migration.
  filter_type text check (filter_type in (
    'all_paid', 'all_registered', 'all_free', 'all_signups', 'abandoned'
  )),
  -- Array of dynamic filters. Members are the UNION of matches across all
  -- selected filters. e.g. ['all_paid','all_free'] = paid customers OR free signups.
  filter_types text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);
-- Idempotent: existing projects pre-multi-filter migration.
alter table lists add column if not exists filter_types text[] not null default array[]::text[];
alter table lists alter column filter_type drop not null;
-- Backfill singular → array for legacy rows.
update lists
  set filter_types = array[filter_type]
where (filter_types is null or filter_types = array[]::text[])
  and filter_type is not null;

create table if not exists sequences (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  event_id uuid references events(id) on delete set null,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists sequences_list_idx on sequences (list_id);
create index if not exists sequences_event_idx on sequences (event_id);

create table if not exists sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  position integer not null default 0,
  email_template_id text references email_templates(id),
  sms_template_id text references sms_templates(id),    -- nullable: email-only
  schedule_type text not null check (schedule_type in (
    'before_event',     -- N hours before event.starts_at
    'after_event',      -- N hours after event.starts_at
    'after_subscribe'   -- N hours after signup.created_at
  )),
  hours_offset integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists sequence_steps_seq_idx on sequence_steps (sequence_id, position);

create table if not exists sequence_sends (
  id uuid primary key default gen_random_uuid(),
  sequence_step_id uuid not null references sequence_steps(id) on delete cascade,
  signup_id text not null references signups(id) on delete cascade,
  sent_at timestamptz not null default now(),
  email_ok boolean not null default false,
  sms_ok boolean not null default false,
  unique (sequence_step_id, signup_id)
);
create index if not exists sequence_sends_signup_idx on sequence_sends (signup_id);

-- ─── Seed: the existing webinar as the first event ───────────────────────
-- If settings has a starts_at_iso configured, mirror it into events row #1
-- so the default reminder sequence has something to anchor against.
insert into events (id, name, starts_at_iso, timezone, active)
select
  '11111111-1111-1111-1111-111111111111'::uuid,
  coalesce(nullif(s.webinar_name, ''), 'BOSSLABS AI Webinar'),
  coalesce(nullif(s.webinar_starts_at_iso, ''), '2026-05-21T20:00:00+08:00'),
  coalesce(nullif(s.webinar_timezone, ''), 'Asia/Manila'),
  true
from settings s
where s.id = 1
on conflict (id) do nothing;

-- ─── Seed: default "All Webinar Attendees" list ──────────────────────────
insert into lists (id, name, description, filter_type, filter_types)
values (
  '22222222-2222-2222-2222-222222222222'::uuid,
  'All Webinar Attendees',
  'Anyone who registered or paid for the webinar.',
  'all_registered',                   -- legacy column for back-compat
  array['all_registered']             -- new multi-filter column
)
on conflict (id) do nothing;

-- ─── Seed: default reminder sequence (replicates the old 6-window cron) ──
insert into sequences (id, list_id, event_id, name, description, active)
values (
  '33333333-3333-3333-3333-333333333333'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'Webinar Reminder Sequence',
  'Six reminders before the live webinar: 60h / 48h / 36h / 24h / 12h / 1h.',
  true
)
on conflict (id) do nothing;

insert into sequence_steps (sequence_id, position, email_template_id, sms_template_id, schedule_type, hours_offset)
select
  '33333333-3333-3333-3333-333333333333'::uuid,
  s.position,
  s.email_template_id,
  s.sms_template_id,
  'before_event',
  s.hours_offset
from (values
  (0, 'reminder_60h', null::text, 60),
  (1, 'reminder_48h', null::text, 48),
  (2, 'reminder_36h', null::text, 36),
  (3, 'reminder_24h', 'reminder_24h', 24),
  (4, 'reminder_12h', null::text, 12),
  (5, 'reminder_1h',  'reminder_1h',  1)
) as s(position, email_template_id, sms_template_id, hours_offset)
where not exists (
  select 1 from sequence_steps
  where sequence_id = '33333333-3333-3333-3333-333333333333'::uuid
);

-- ─── Manual sequence subscriptions ────────────────────────────────────
-- Beyond the list-driven audience for each sequence, an admin can also
-- subscribe a specific customer to a sequence directly from their profile.
-- The cron treats the union of (list members ∪ manual subs) as the audience.
-- For after_subscribe schedules, subscribed_at is used as the anchor.

create table if not exists sequence_subscriptions (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  signup_id text not null references signups(id) on delete cascade,
  subscribed_at timestamptz not null default now(),
  unique (sequence_id, signup_id)
);
create index if not exists sequence_subscriptions_signup_idx on sequence_subscriptions (signup_id);
create index if not exists sequence_subscriptions_seq_idx on sequence_subscriptions (sequence_id);

-- ─── Link signups + lists to events ───────────────────────────────────
-- Signups get tagged with an event_id at registration time. This is what
-- lets a list be scoped to a specific event ("attendees of June workshop"
-- vs "attendees of May webinar"). Settings.active_event_id determines
-- which event new signups attach to.

alter table signups add column if not exists event_id uuid references events(id) on delete set null;
create index if not exists signups_event_idx on signups (event_id);

alter table lists add column if not exists event_id uuid references events(id) on delete set null;
create index if not exists lists_event_idx on lists (event_id);

alter table settings add column if not exists active_event_id uuid references events(id) on delete set null;

-- Backfill: tag existing signups + default list + settings against the seeded event.
update settings
  set active_event_id = '11111111-1111-1111-1111-111111111111'::uuid
where id = 1 and active_event_id is null;

update signups
  set event_id = '11111111-1111-1111-1111-111111111111'::uuid
where event_id is null;

update lists
  set event_id = '11111111-1111-1111-1111-111111111111'::uuid
where id = '22222222-2222-2222-2222-222222222222'::uuid and event_id is null;

-- ─── Backfill: convert metadata.reminders.{h60..h1} into sequence_sends ──
-- Existing signups already received some reminders. Insert sequence_sends
-- rows for each (signup, step) pair that's already been sent, so the new
-- cron doesn't re-send them. Idempotent via the unique constraint.
do $$
declare
  step_map jsonb := jsonb_build_object(
    'h60', (select id from sequence_steps where sequence_id = '33333333-3333-3333-3333-333333333333'::uuid and hours_offset = 60),
    'h48', (select id from sequence_steps where sequence_id = '33333333-3333-3333-3333-333333333333'::uuid and hours_offset = 48),
    'h36', (select id from sequence_steps where sequence_id = '33333333-3333-3333-3333-333333333333'::uuid and hours_offset = 36),
    'h24', (select id from sequence_steps where sequence_id = '33333333-3333-3333-3333-333333333333'::uuid and hours_offset = 24),
    'h12', (select id from sequence_steps where sequence_id = '33333333-3333-3333-3333-333333333333'::uuid and hours_offset = 12),
    'h1',  (select id from sequence_steps where sequence_id = '33333333-3333-3333-3333-333333333333'::uuid and hours_offset = 1)
  );
  k text;
begin
  for k in select jsonb_object_keys(step_map) loop
    insert into sequence_sends (sequence_step_id, signup_id, sent_at, email_ok)
    select
      (step_map->>k)::uuid,
      s.id,
      coalesce(
        (s.metadata->'reminders'->>k)::timestamptz,
        now()
      ),
      true
    from signups s
    where s.metadata->'reminders'->>k is not null
      and (step_map->>k) is not null
    on conflict (sequence_step_id, signup_id) do nothing;
  end loop;
end $$;

-- ─── Refreshed reminder copy + new reminder_3h template ──────────────────
-- All seven webinar reminders (60h / 48h / 36h / 24h / 12h / 3h / 1h) get
-- the new English-led, upmarket-register copy aimed at paid-attendee
-- show-up. The html column is left empty — lib/email.ts renders the
-- markdown body through renderEmailMarkdown() on the fly when html is
-- missing. Admin Save in /admin/templates also re-renders.

insert into email_templates (id, name, subject, html, body)
values
('reminder_60h',
 '60-hour reminder',
 $sub$You're confirmed for {{webinarDate}} — let's make it count$sub$,
 '',
 $body$^^60-hour reminder^^

# You're confirmed, {{firstName}}.

You're confirmed for the BOSSLABS session on **{{webinarDate}}, {{webinarTime}} {{webinarTimezone}}**. Glad to have you in.

One request while it's in front of you: block {{webinarTime}} in your calendar right now, and set a reminder for 15 minutes before. It sounds basic, but it's the single thing that separates the people who get full value from a session like this and the people who mean to attend and don't.

You've already invested in being there. Let's make sure you actually are.

Over the next two days I'll send a few short notes so you walk in ready. For now — calendar blocked?

[[Open the Zoom call]]({{zoomJoinUrl}})

— Mikey

P.S. Come with one real bottleneck in your business in mind. You'll see why on the night.$body$
),

('reminder_48h',
 '48-hour reminder',
 $sub$Here's exactly what we're building for you live$sub$,
 '',
 $body$^^48-hour reminder^^

# Here's what to expect, {{firstName}}.

Two days out. Let me tell you precisely what to expect on **{{webinarDate}}**, because it's different from most things labeled "AI webinar."

We're not running slides full of theory. Mikey and I are building a working app **live, from zero**, in front of you. Here's the shape of the night:

— A real app built step by step, nothing pre-recorded
— The exact system we use for our SME clients
— A straight answer to the question most owners carry: *can I actually do this myself?*

This is the kind of session where what you see changes how you think about your own business by the end. That only works if you're in the room while it happens.

**{{webinarDate}}, {{webinarTime}} {{webinarTimezone}}.** You're in.

[[Open the Zoom call]]({{zoomJoinUrl}})

— Mikey

P.S. Keep that one bottleneck in mind. By the end you'll see exactly how a system like this removes it.$body$
),

('reminder_36h',
 '36-hour reminder',
 $sub$This won't be replayed in full — here's why that matters$sub$,
 '',
 $body$^^36-hour reminder^^

# The live room is where the value lives.

Hi {{firstName}} — a direct note, because it's the thing that quietly costs people the most.

The temptation with any paid session is to think, *"I've already paid — I'll just catch the replay."* I want to be honest with you: we are not replaying this in full. The live build, the real-time problem-solving, the part where you can ask and we answer — none of that survives in a recording. The value is in the room.

You invested to be there live. Don't trade that for a recording that won't exist.

**{{webinarDate}}, {{webinarTime}} {{webinarTimezone}}.** Log in a few minutes early.

[[Open the Zoom call]]({{zoomJoinUrl}})

— Mikey

P.S. Bring the bottleneck. The live portion is where it actually gets solved.$body$
),

('reminder_24h',
 '24-hour reminder',
 $sub$Tomorrow, {{webinarTime}} — here's how the night runs$sub$,
 '',
 $body$^^24-hour reminder^^

# Tomorrow at {{webinarTime}}, {{firstName}}.

Tomorrow — **{{webinarDate}}, {{webinarTime}} {{webinarTimezone}}**. Here's the run of show so you know what you're walking into:

— We open by framing the one thing that changes everything (don't miss this — it sets up the rest)
— Live app build from zero, every step visible
— The exact system behind our SME client work
— A clear path for anyone ready to take the next step

Log in by {{webinarTime}} minus 5. The opening sets up everything that follows, so the first minutes matter most.

[[Open the Zoom call]]({{zoomJoinUrl}})

— Mikey

P.S. This isn't replayed in full. Tomorrow night is the room.$body$
),

('reminder_12h',
 '12-hour reminder',
 $sub$Tonight, {{webinarTime}}. Your link's here.$sub$,
 '',
 $body$^^12-hour reminder^^

# Tonight's the night, {{firstName}}.

Tonight — **{{webinarTime}} {{webinarTimezone}}**.

You committed to this for a reason. Whatever made you say yes, tonight you'll see exactly how it gets solved — live.

[[Open the Zoom call]]({{zoomJoinUrl}})

Log in 5 minutes early so you don't miss the opening. See you tonight.

— Mikey$body$
),

('reminder_3h',
 '3-hour reminder',
 $sub$A few hours out — quick heads up before tonight$sub$,
 '',
 $body$^^3-hour reminder^^

# A few hours out, {{firstName}}.

We go live in a few hours — **{{webinarTime}} {{webinarTimezone}} tonight**.

Quick checklist so the evening's smooth: wind down your day a little early, find a quiet spot, and have that one business bottleneck ready in your head. You'll know what to do with it by the end.

This is the afternoon where most people quietly decide whether they'll actually show. You already paid for your seat — take it.

[[Open the Zoom call]]({{zoomJoinUrl}})

See you at {{webinarTime}}.

— Mikey$body$
),

('reminder_1h',
 '1-hour reminder',
 $sub$We start in an hour — see you in the room$sub$,
 '',
 $body$^^Starts in 1 hour^^

# One hour to go, {{firstName}}.

One hour to go — **{{webinarTime}} {{webinarTimezone}} sharp**.

You're already in. All that's left is to actually be in the room when it counts. Join a few minutes early so you're settled before we open.

[[Open the Zoom call]]({{zoomJoinUrl}})

See you inside,
Mikey$body$
)
on conflict (id) do update set
  name = excluded.name,
  subject = excluded.subject,
  html = excluded.html,
  body = excluded.body,
  updated_at = now();

-- ─── Insert reminder_3h into the default Webinar Reminder Sequence ───────
-- Position 5, between 12h (position 4) and 1h. Bump 1h's position to 6 so
-- the UI still renders the steps in chronological order. Idempotent.
update sequence_steps
  set position = 6
where sequence_id = '33333333-3333-3333-3333-333333333333'::uuid
  and email_template_id = 'reminder_1h'
  and position < 6;

insert into sequence_steps
  (sequence_id, position, email_template_id, sms_template_id, schedule_type, hours_offset)
select
  '33333333-3333-3333-3333-333333333333'::uuid,
  5,
  'reminder_3h',
  null::text,
  'before_event',
  3
where not exists (
  select 1 from sequence_steps
  where sequence_id = '33333333-3333-3333-3333-333333333333'::uuid
    and email_template_id = 'reminder_3h'
);

-- ─── Set the active Zoom join URL ────────────────────────────────────────
-- The new templates all reference {{zoomJoinUrl}}; make sure settings has
-- the live Zoom link configured so substitution resolves to a real URL.
update settings
  set zoom_join_url = 'https://us02web.zoom.us/j/86011649255',
      updated_at = now()
where id = 1;
