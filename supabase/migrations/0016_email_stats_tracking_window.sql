-- 0016_email_stats_tracking_window.sql
-- Open/click tracking only started when the SES configuration set went live
-- (2026-06-10). Emails sent before that can't have open/click data, so the
-- open/click RATE must be scoped to the trackable window (p_since) — otherwise
-- old untracked emails dilute it to ~0. Deliverability/bounce stay over the
-- full pool (identity notifications tracked those all along).
drop function if exists email_stats();

create or replace function email_stats(p_since timestamptz default null)
returns json
language sql
stable
as $$
  with pool as (
    select email_status as st, sent_at as ts from sequence_sends where email_ok = true
    union all
    select metadata->>'confirmationStatus', (metadata->>'confirmationSent')::timestamptz
      from signups where metadata->>'confirmationStatus' is not null
  ),
  reco as (
    select distinct s.signup_id, sg.status as sig_status
    from sequence_sends s
    join sequence_steps st on st.id = s.sequence_step_id
    join signups sg on sg.id = s.signup_id
    where s.email_ok = true
      and st.email_template_id in (
        'payment_recovery', 'payment_recovery_24h', 'payment_recovery_final'
      )
  )
  select json_build_object(
    'reached',      (select count(*) from pool where st in ('delivered','opened','clicked')),
    'bounced',      (select count(*) from pool where st = 'bounced'),
    'complained',   (select count(*) from pool where st = 'complained'),
    'opened',       (select count(*) from pool where st in ('opened','clicked')),
    'clicked',      (select count(*) from pool where st = 'clicked'),
    'pending',      (select count(*) from pool where st is null or st = 'sent'),
    'total',        (select count(*) from pool),
    -- Trackable subset: emails sent at/after open-click tracking went live.
    'trackReached', (select count(*) from pool where st in ('delivered','opened','clicked') and (p_since is null or ts >= p_since)),
    'trackOpened',  (select count(*) from pool where st in ('opened','clicked') and (p_since is null or ts >= p_since)),
    'trackClicked', (select count(*) from pool where st = 'clicked' and (p_since is null or ts >= p_since)),
    'recoEmailed',  (select count(*) from reco),
    'recoPaid',     (select count(*) from reco where sig_status in ('paid','attended'))
  );
$$;
