-- Affiliate testimonial videos.
-- Affiliates upload short testimonial videos in their dashboard; we run ads to
-- them and they earn on every referred sale. Files live in the private Supabase
-- Storage bucket `affiliate-videos` (create once via the storage API:
--   supabase.storage.createBucket('affiliate-videos', { public: false }))
-- and are written via a server-signed upload URL so big videos bypass the
-- serverless body limit. This table just indexes them.

create table if not exists affiliate_videos (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  path text not null,                 -- object path: "<affiliate_id>/<ts>-<name>"
  original_name text default '',
  content_type text default '',
  size_bytes bigint default 0,
  created_at timestamptz not null default now()
);

create index if not exists affiliate_videos_aff_idx
  on affiliate_videos (affiliate_id, created_at desc);
