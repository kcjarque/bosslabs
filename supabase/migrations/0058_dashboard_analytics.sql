-- One round trip for the dashboard's traffic funnel, A/B counts, and current /
-- previous chart buckets. This replaces six independent RPC calls and scans.
create or replace function dashboard_page_view_metrics(
  p_since timestamptz,
  p_until timestamptz,
  p_previous_since timestamptz,
  p_bucket_seconds integer
)
returns jsonb
language sql
stable
as $$
  with relevant as (
    select created_at, path, session_id
    from page_views
    where created_at >= p_previous_since and created_at <= p_until
  ), counts as (
    select
      count(*) filter (where created_at >= p_since)::bigint all_total,
      count(distinct session_id) filter (where created_at >= p_since)::bigint all_unique,
      count(*) filter (where created_at >= p_since and path ilike '/checkout%')::bigint checkout_total,
      count(distinct session_id) filter (where created_at >= p_since and path ilike '/checkout%')::bigint checkout_unique,
      count(distinct session_id) filter (where created_at >= p_since and path ilike '/__ab/home-a%')::bigint ab_a_unique,
      count(distinct session_id) filter (where created_at >= p_since and path ilike '/__ab/home-b%')::bigint ab_b_unique
    from relevant
  ), bucketed as (
    select
      case when created_at >= p_since then 'current' else 'previous' end period,
      to_timestamp(
        floor((extract(epoch from created_at) - extract(epoch from
          case when created_at >= p_since then p_since else p_previous_since end
        )) / p_bucket_seconds) * p_bucket_seconds
        + extract(epoch from case when created_at >= p_since then p_since else p_previous_since end)
      ) bucket_start,
      count(*)::bigint total,
      count(distinct session_id)::bigint unique_sessions
    from relevant
    group by 1, 2
  )
  select jsonb_build_object(
    'all', jsonb_build_object('total', counts.all_total, 'uniqueSessions', counts.all_unique),
    'checkout', jsonb_build_object('total', counts.checkout_total, 'uniqueSessions', counts.checkout_unique),
    'abAUnique', counts.ab_a_unique,
    'abBUnique', counts.ab_b_unique,
    'currentBuckets', coalesce((select jsonb_agg(jsonb_build_object(
      'bucketStart', bucket_start, 'total', total, 'uniqueSessions', unique_sessions
    ) order by bucket_start) from bucketed where period = 'current'), '[]'::jsonb),
    'previousBuckets', coalesce((select jsonb_agg(jsonb_build_object(
      'bucketStart', bucket_start, 'total', total, 'uniqueSessions', unique_sessions
    ) order by bucket_start) from bucketed where period = 'previous'), '[]'::jsonb)
  )
  from counts;
$$;

-- Supports the combined time-window scan while retaining the existing path
-- and session indexes for other analytics calls.
create index if not exists page_views_created_path_session_idx
  on page_views (created_at, path, session_id);

-- The dashboard still needs row-level detail for its historical charts and
-- recent-signup list, but not the large metadata blobs or unrelated columns.
-- Returning a purpose-built projection removes most of the previous ~4 MB
-- transfer while keeping every displayed metric identical.
drop function if exists dashboard_signups();
create or replace function dashboard_signups(
  p_offset integer default 0,
  p_limit integer default 500
)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'firstName', first_name,
    'lastName', last_name,
    'email', email,
    'phone', phone,
    'source', source,
    'status', status,
    'amountCentavos', amount_centavos,
    'bumped', bumped,
    'createdAt', created_at,
    'eventId', event_id,
    'metadata', jsonb_strip_nulls(jsonb_build_object(
      'confirmationSent', metadata->'confirmationSent',
      'otoAmount', metadata->'otoAmount',
      'otoConfirmed', metadata->'otoConfirmed',
      'homeVariant', metadata->'homeVariant',
      'paymentMethodGroup', metadata->'paymentMethodGroup'
    ))
  ) order by created_at desc), '[]'::jsonb)
  from (
    select * from signups
    order by created_at desc
    offset greatest(p_offset, 0)
    limit least(greatest(p_limit, 1), 500)
  ) signups;
$$;
