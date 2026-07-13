-- Email Machine v2.1 — Phase 1+2 data foundation.
-- Extends the existing `signups` table (the live contact record) rather than
-- introducing a parallel `contacts` table, so nothing that works breaks.
-- Adds: lifecycle/tagging columns on signups, offers (price truth),
-- engagement_events + short_links (click tracking, email + SMS), survey_responses,
-- event_attendance.

-- ── 1.1 signups: lifecycle + tagging columns ──────────────────────────────
alter table public.signups
  add column if not exists industry text,
  add column if not exists pain text,
  add column if not exists pain_freetext text,
  add column if not exists intent text,
  add column if not exists send_state text not null default 'active_broadcast',
  add column if not exists human_handling boolean not null default false,
  add column if not exists last_engaged_at timestamptz,
  add column if not exists last_marketing_sent_at timestamptz,
  add column if not exists sos_history jsonb not null default '[]'::jsonb,
  add column if not exists vault_downsell_sent_at timestamptz,
  -- denormalized "who's interested" — click on an offer link stamps a tag here
  -- (e.g. 'interested:retreat') so segments are one indexed query, not a join.
  add column if not exists interest_tags text[] not null default '{}'::text[];

create index if not exists signups_send_state_idx on public.signups (send_state);
create index if not exists signups_interest_tags_idx on public.signups using gin (interest_tags);

-- ── 1.5 offers: SINGLE SOURCE OF PRICE TRUTH ──────────────────────────────
create table if not exists public.offers (
  key text primary key,                 -- retreat | dfy | vault | oto_1on1
  status text not null default 'open',  -- open | waitlist | closed
  next_instance_date date,
  seats_total int,
  seats_taken int,
  price_display text,                    -- what templates render, e.g. '₱75,000'
  price_centavos int,                    -- numeric, for logic
  target_url text,                       -- the funnel/checkout link for this offer
  updated_at timestamptz not null default now()
);
insert into public.offers (key, status, price_display, price_centavos, seats_total, next_instance_date, target_url) values
  ('retreat',  'open', '₱75,000', 7500000, 15, '2026-07-31', 'https://www.bosslabs.live/vibecode-retreat'),
  ('oto_1on1', 'open', '₱5,997',  599700,  null, null,        'https://www.bosslabs.live/order-bump?product=oto2'),
  ('vault',    'open', '₱999',    99900,   null, null,        'https://www.bosslabs.live/order-bump?product=oto'),
  ('dfy',      'open', null,      null,    null, null,        'https://www.bosslabs.live/apply')
on conflict (key) do nothing;

-- ── 1.3 engagement_events: channel-aware interaction log ──────────────────
create table if not exists public.engagement_events (
  id uuid primary key default gen_random_uuid(),
  contact_id text,
  template_key text,
  channel text not null default 'email',   -- email | sms
  event text not null,                      -- sent | open | click | reply | bounce | unsub
  link_tag text,
  created_at timestamptz not null default now()
);
create index if not exists eng_contact_idx on public.engagement_events (contact_id);
create index if not exists eng_tag_idx on public.engagement_events (link_tag);
create index if not exists eng_created_idx on public.engagement_events (created_at desc);

-- ── 1.3.1 short_links: SMS-friendly per-contact tracked links ─────────────
create table if not exists public.short_links (
  slug text primary key,                    -- 6-char
  contact_id text,
  link_tag text,
  channel text not null default 'sms',
  target_url text not null,
  created_at timestamptz not null default now()
);
create index if not exists short_links_contact_idx on public.short_links (contact_id);

-- ── 1.4 survey_responses ──────────────────────────────────────────────────
create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  contact_id text,
  event_id text,
  q1_industry text,
  q2_pain text,
  q2_freetext text,
  q3_freetext text,
  q4_intent text,
  created_at timestamptz not null default now()
);
create index if not exists survey_contact_idx on public.survey_responses (contact_id);

-- ── 1.2 event_attendance ──────────────────────────────────────────────────
create table if not exists public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null,
  event_id text not null,
  attended boolean,
  watched_replay boolean not null default false,
  source text,                              -- zoom_import | manual
  created_at timestamptz not null default now(),
  unique (contact_id, event_id)
);
create index if not exists att_event_idx on public.event_attendance (event_id);
