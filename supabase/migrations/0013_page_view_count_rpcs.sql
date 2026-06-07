-- 0013_page_view_count_rpcs.sql
-- Funnel analytics undercounted unique visitors. countPageViews and
-- getVisitBuckets fetched page_views rows and de-duplicated session_id in JS,
-- but PostgREST caps a single response at 1000 rows. Once page_views grew past
-- 1000, the distinct-session count was computed from only the first 1000
-- beacons (e.g. 571 of 2440 real sessions, ~13 days of traffic). These RPCs
-- push count + count(distinct) into SQL so the result is exact regardless of
-- table size, and scale far better than paginating every dashboard load.

-- Exact total + distinct-session counts in a window, optional path-prefix filter.
create or replace function count_page_views(
  p_since timestamptz,
  p_until timestamptz default null,
  p_prefixes text[] default null
)
returns table(total bigint, unique_sessions bigint)
language sql
stable
as $$
  select
    count(*)::bigint as total,
    count(distinct session_id)::bigint as unique_sessions
  from page_views
  where created_at >= p_since
    and (p_until is null or created_at <= p_until)
    and (
      p_prefixes is null
      or exists (select 1 from unnest(p_prefixes) px where path ilike px || '%')
    );
$$;

-- Per-bucket total + distinct-session counts. Buckets are aligned to the same
-- grid the caller pre-allocates: bucket_start = p_since + n * p_bucket_seconds.
create or replace function bucket_page_views(
  p_since timestamptz,
  p_until timestamptz,
  p_bucket_seconds integer,
  p_prefixes text[] default null
)
returns table(bucket_start timestamptz, total bigint, unique_sessions bigint)
language sql
stable
as $$
  select
    to_timestamp(
      floor((extract(epoch from created_at) - extract(epoch from p_since)) / p_bucket_seconds)
        * p_bucket_seconds
      + extract(epoch from p_since)
    ) as bucket_start,
    count(*)::bigint as total,
    count(distinct session_id)::bigint as unique_sessions
  from page_views
  where created_at >= p_since
    and created_at < p_until
    and (
      p_prefixes is null
      or exists (select 1 from unnest(p_prefixes) px where path ilike px || '%')
    )
  group by 1
  order by 1;
$$;
