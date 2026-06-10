-- 0015_email_stats.sql
-- Aggregate email performance in SQL so the admin dashboard's email section
-- doesn't fetch (and undercount past) PostgREST's 1000-row cap as volume grows.
-- Pool = all successfully-sent drip/sequence emails + transactional confirmation
-- emails. Status uses the no-downgrade rank, so opened/clicked imply delivered.
create or replace function email_stats()
returns json
language sql
stable
as $$
  with pool as (
    select email_status as st from sequence_sends where email_ok = true
    union all
    select metadata->>'confirmationStatus' from signups
      where metadata->>'confirmationStatus' is not null
  ),
  reco as (
    -- distinct abandoned carts that were successfully emailed a recovery
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
    'reached',     (select count(*) from pool where st in ('delivered','opened','clicked')),
    'bounced',     (select count(*) from pool where st = 'bounced'),
    'complained',  (select count(*) from pool where st = 'complained'),
    'opened',      (select count(*) from pool where st in ('opened','clicked')),
    'clicked',     (select count(*) from pool where st = 'clicked'),
    'pending',     (select count(*) from pool where st is null or st = 'sent'),
    'total',       (select count(*) from pool),
    'recoEmailed', (select count(*) from reco),
    'recoPaid',    (select count(*) from reco where sig_status in ('paid','attended'))
  );
$$;
