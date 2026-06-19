-- 0026_sent_messages_replay.sql
-- Surface the post-webinar REPLAY blast in the consolidated Email & SMS Logs.
--
-- The hourly replay cron (app/api/cron/replay) emails + SMSes the just-finished
-- webinar's paid/attended/no-show registrants and stamps a per-recipient marker
-- at metadata.reminders['replay_<eventId>']. That marker was never read by the
-- log feed, so a real blast (e.g. 67 paid attendees on June 18) was invisible.
-- We add it as a grouped-per-event source, exactly like the sequence blasts.
-- No per-recipient delivery tracking on this path, so the row reads "<N> sent".
--
-- Recreates the whole function (create or replace) — only the two Replay unions
-- are new; everything else is byte-for-byte the prior 0024 definition.

create or replace function sent_messages(
  p_channel text,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  group_key   text,
  ts          timestamptz,
  kind        text,
  label       text,
  template_id text,
  recipient   text,
  signup_id   text,
  recipients  int,
  status      text,
  delivered   int,
  opened      int,
  bounced     int
)
language sql
stable
as $$
  -- ── Sequence email blasts (grouped by step + Manila day) ──────────────
  select
    'seq:' || s.sequence_step_id::text || ':' ||
      to_char(s.sent_at at time zone 'Asia/Manila', 'YYYY-MM-DD'),
    max(s.sent_at),
    'Sequence',
    coalesce(seq.name, 'Sequence') || ' · ' ||
      coalesce(et.name, st.email_template_id, 'email'),
    st.email_template_id,
    null, null,
    count(*)::int,
    null,
    count(*) filter (where s.email_status in ('delivered', 'opened', 'clicked'))::int,
    count(*) filter (where s.email_status in ('opened', 'clicked'))::int,
    count(*) filter (where s.email_status = 'bounced')::int
  from sequence_sends s
  join sequence_steps st on st.id = s.sequence_step_id
  left join sequences seq on seq.id = st.sequence_id
  left join email_templates et on et.id = st.email_template_id
  where p_channel = 'email' and s.email_ok and st.email_template_id is not null
    and s.sent_at >= p_from and s.sent_at < p_to
  group by s.sequence_step_id,
    to_char(s.sent_at at time zone 'Asia/Manila', 'YYYY-MM-DD'),
    seq.name, et.name, st.email_template_id

  union all
  -- ── Sequence SMS blasts ──────────────────────────────────────────────
  select
    'seq:' || s.sequence_step_id::text || ':' ||
      to_char(s.sent_at at time zone 'Asia/Manila', 'YYYY-MM-DD'),
    max(s.sent_at),
    'Sequence',
    coalesce(seq.name, 'Sequence') || ' · ' ||
      coalesce(mt.name, st.sms_template_id, 'sms'),
    st.sms_template_id,
    null, null,
    count(*)::int,
    null, 0, 0, 0
  from sequence_sends s
  join sequence_steps st on st.id = s.sequence_step_id
  left join sequences seq on seq.id = st.sequence_id
  left join sms_templates mt on mt.id = st.sms_template_id
  where p_channel = 'sms' and s.sms_ok and st.sms_template_id is not null
    and s.sent_at >= p_from and s.sent_at < p_to
  group by s.sequence_step_id,
    to_char(s.sent_at at time zone 'Asia/Manila', 'YYYY-MM-DD'),
    seq.name, mt.name, st.sms_template_id

  union all
  -- ── Payment confirmation email (solo) ────────────────────────────────
  select null, (sg.metadata->>'confirmationSent')::timestamptz,
    'Payment confirmation', 'Confirmation + Zoom link', 'paid_confirmation',
    sg.email, sg.id, 1,
    coalesce(sg.metadata->>'confirmationStatus', 'sent'), 0, 0, 0
  from signups sg
  where p_channel = 'email' and sg.metadata->>'confirmationSent' ~ '^\d{4}'
    and (sg.metadata->>'confirmationSent')::timestamptz >= p_from
    and (sg.metadata->>'confirmationSent')::timestamptz < p_to

  union all
  -- ── Payment confirmation SMS (solo) ──────────────────────────────────
  select null, (sg.metadata->>'confirmationSmsSent')::timestamptz,
    'Payment confirmation', 'Confirmation SMS', 'paid_confirmation',
    sg.phone, sg.id, 1,
    coalesce(sg.metadata->>'confirmationSmsStatus', 'sent'), 0, 0, 0
  from signups sg
  where p_channel = 'sms' and sg.metadata->>'confirmationSmsSent' ~ '^\d{4}'
    and (sg.metadata->>'confirmationSmsSent')::timestamptz >= p_from
    and (sg.metadata->>'confirmationSmsSent')::timestamptz < p_to

  union all
  -- ── Recovery email (solo) ────────────────────────────────────────────
  select null, (sg.metadata->>'recoveryEmailSent')::timestamptz,
    'Recovery', 'Cart-recovery email', 'payment_recovery',
    sg.email, sg.id, 1,
    coalesce(sg.metadata->>'recoveryEmailStatus', 'sent'), 0, 0, 0
  from signups sg
  where p_channel = 'email' and sg.metadata->>'recoveryEmailSent' ~ '^\d{4}'
    and (sg.metadata->>'recoveryEmailSent')::timestamptz >= p_from
    and (sg.metadata->>'recoveryEmailSent')::timestamptz < p_to

  union all
  -- ── Recovery SMS (solo) ──────────────────────────────────────────────
  select null, (sg.metadata->>'recoverySmsSent')::timestamptz,
    'Recovery', 'Cart-recovery SMS', 'payment_recovery',
    sg.phone, sg.id, 1, 'sent', 0, 0, 0
  from signups sg
  where p_channel = 'sms' and sg.metadata->>'recoverySmsSent' ~ '^\d{4}'
    and (sg.metadata->>'recoverySmsSent')::timestamptz >= p_from
    and (sg.metadata->>'recoverySmsSent')::timestamptz < p_to

  union all
  -- ── Replay email blast (grouped per event from the send markers) ──────
  --    The cron stamps metadata.reminders['replay_<eventId>'] per recipient;
  --    we group those into one row per webinar. No delivery tracking on this
  --    path, so delivered/opened stay 0 and the row reads "<N> sent".
  select
    'replay:' || sg.event_id::text,
    max((sg.metadata->'reminders'->>('replay_' || sg.event_id::text))::timestamptz),
    'Replay',
    'Replay — ' || coalesce(ev.name, 'webinar'),
    'replay',
    null, null,
    count(*)::int,
    null, 0, 0, 0
  from signups sg
  join events ev on ev.id = sg.event_id
  where p_channel = 'email'
    and sg.event_id is not null
    and sg.metadata->'reminders' ? ('replay_' || sg.event_id::text)
    and (sg.metadata->'reminders'->>('replay_' || sg.event_id::text))::timestamptz >= p_from
    and (sg.metadata->'reminders'->>('replay_' || sg.event_id::text))::timestamptz < p_to
  group by sg.event_id, ev.name

  union all
  -- ── Replay SMS blast (same markers; recipients that have a phone) ─────
  select
    'replay:' || sg.event_id::text,
    max((sg.metadata->'reminders'->>('replay_' || sg.event_id::text))::timestamptz),
    'Replay',
    'Replay — ' || coalesce(ev.name, 'webinar'),
    'replay',
    null, null,
    count(*)::int,
    null, 0, 0, 0
  from signups sg
  join events ev on ev.id = sg.event_id
  where p_channel = 'sms'
    and sg.event_id is not null
    and coalesce(sg.phone, '') <> ''
    and sg.metadata->'reminders' ? ('replay_' || sg.event_id::text)
    and (sg.metadata->'reminders'->>('replay_' || sg.event_id::text))::timestamptz >= p_from
    and (sg.metadata->'reminders'->>('replay_' || sg.event_id::text))::timestamptz < p_to
  group by sg.event_id, ev.name

  union all
  -- ── OTO / upgrade confirmation email (solo) ──────────────────────────
  select null, (sg.metadata->>'otoConfirmed')::timestamptz,
    'Upgrade confirmation', '1:1 / Vault confirmation', 'oto_confirmation',
    sg.email, sg.id, 1, 'sent', 0, 0, 0
  from signups sg
  where p_channel = 'email' and sg.metadata->>'otoConfirmed' ~ '^\d{4}'
    and (sg.metadata->>'otoConfirmed')::timestamptz >= p_from
    and (sg.metadata->>'otoConfirmed')::timestamptz < p_to

  union all
  -- ── OTO / upgrade confirmation SMS (solo, only when a phone exists) ───
  select null, (sg.metadata->>'otoConfirmed')::timestamptz,
    'Upgrade confirmation', '1:1 / Vault confirmation', 'oto_confirmation',
    sg.phone, sg.id, 1, 'sent', 0, 0, 0
  from signups sg
  where p_channel = 'sms' and sg.metadata->>'otoConfirmed' ~ '^\d{4}'
    and coalesce(sg.phone, '') <> ''
    and (sg.metadata->>'otoConfirmed')::timestamptz >= p_from
    and (sg.metadata->>'otoConfirmed')::timestamptz < p_to

  union all
  -- ── Admin sends, grouped by (template, channel, day) ─────────────────
  --    A 1-count group keeps its recipient so single sends still read solo.
  select
    'admin:' || p_channel || ':' || (a->>'templateId') || ':' ||
      to_char((a->>'ts')::timestamptz at time zone 'Asia/Manila', 'YYYY-MM-DD'),
    max((a->>'ts')::timestamptz),
    'Admin send',
    coalesce(et.name, mt.name, a->>'templateId'),
    a->>'templateId',
    case when count(*) = 1 then min(case when p_channel = 'email' then sg.email else sg.phone end) end,
    case when count(*) = 1 then min(sg.id) end,
    count(*)::int,
    null, 0, 0, 0
  from signups sg
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(sg.metadata->'adminSends') = 'array'
      then sg.metadata->'adminSends' else '[]'::jsonb end
  ) a
  left join email_templates et on p_channel = 'email' and et.id = a->>'templateId'
  left join sms_templates mt on p_channel = 'sms' and mt.id = a->>'templateId'
  where (a->>'channel') = p_channel and a->>'ts' ~ '^\d{4}'
    and (a->>'ts')::timestamptz >= p_from and (a->>'ts')::timestamptz < p_to
  group by a->>'templateId',
    to_char((a->>'ts')::timestamptz at time zone 'Asia/Manila', 'YYYY-MM-DD'),
    et.name, mt.name

  union all
  -- ── Retreat: reservation email (email only) ──────────────────────────
  select null, r.created_at, 'Retreat reservation', 'Reservation received',
    'retreat_reserved', r.email, null, 1, 'sent', 0, 0, 0
  from retreat_reservations r
  where p_channel = 'email' and r.created_at >= p_from and r.created_at < p_to

  union all
  -- ── Retreat: confirmation on proof submission ────────────────────────
  select null, r.proof_submitted_at, 'Retreat confirmation', 'Proof received — confirmed',
    'retreat_confirmation', r.email, null, 1, 'sent', 0, 0, 0
  from retreat_reservations r
  where p_channel = 'email' and r.proof_submitted_at is not null
    and r.proof_submitted_at >= p_from and r.proof_submitted_at < p_to

  union all
  -- ── Retreat: confirmation on card payment ────────────────────────────
  select null, r.paid_at, 'Retreat payment', 'Payment confirmed',
    'retreat_confirmation', r.email, null, 1, 'sent', 0, 0, 0
  from retreat_reservations r
  where p_channel = 'email' and r.paid_at is not null
    and r.paid_at >= p_from and r.paid_at < p_to

  order by 2 desc
$$;
