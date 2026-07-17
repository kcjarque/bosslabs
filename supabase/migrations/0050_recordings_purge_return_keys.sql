-- Make the recording-purge functions S3-aware.
--
-- These two functions previously existed only in the cloud DB (never in the
-- repo). Committing them now, redefined to ALSO return the deleted rows'
-- `s3_key`s so the daily cron can delete the matching S3 objects after the row
-- delete. Retention semantics are otherwise unchanged:
--   - purge_idle_recordings: sessions spanning > max_min not linked to a paid
--     /attended signup (tabs left open — storage waste).
--   - purge_old_recordings: non-purchase recordings older than max_age_days;
--     paid/attended/no-show kept forever.
-- Both now return { sessions, bytes, keys[] }.

create or replace function public.purge_idle_recordings(max_min integer default 10)
returns json language plpgsql as $$
declare v_sessions int := 0; v_bytes bigint := 0; v_keys text[];
begin
  create temp table _purge_targets on commit drop as
    with sess as (
      select session_id,
             extract(epoch from (max(created_at)-min(created_at))) as span_sec,
             sum(size_bytes) as bytes
      from session_recordings group by session_id
    )
    select s.session_id, s.bytes from sess s
    where s.span_sec > max_min*60
      and not exists (
        select 1 from signups sg
        where sg.metadata->>'blSessionId' = s.session_id
          and sg.status in ('paid','attended')
      );
  select count(*), coalesce(sum(bytes),0) into v_sessions, v_bytes from _purge_targets;
  with del as (
    delete from session_recordings
    where session_id in (select session_id from _purge_targets)
    returning s3_key
  )
  select array_agg(s3_key) filter (where s3_key is not null) into v_keys from del;
  return json_build_object('sessions', v_sessions, 'bytes', v_bytes,
                           'keys', coalesce(v_keys, array[]::text[]));
end $$;

create or replace function public.purge_old_recordings(max_age_days integer default 5)
returns json language plpgsql as $$
declare s int; b bigint; k text[];
begin
  with paid as (
    select metadata->>'blSessionId' sid from signups
    where status in ('paid','attended','no-show') and metadata->>'blSessionId' is not null
  ), doomed as (
    delete from session_recordings sr
    where sr.created_at < now() - (max_age_days || ' days')::interval
      and sr.session_id not in (select sid from paid)
    returning sr.session_id, sr.size_bytes, sr.s3_key
  )
  select count(distinct session_id), coalesce(sum(size_bytes),0),
         array_agg(s3_key) filter (where s3_key is not null)
    into s, b, k from doomed;
  return json_build_object('sessions', s, 'bytes', b,
                           'keys', coalesce(k, array[]::text[]));
end $$;
