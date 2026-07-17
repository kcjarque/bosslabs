-- Move rrweb session-recording blobs off Postgres onto S3.
--
-- session_recordings.events (jsonb) was ~97% of the whole database (1.6 GB on
-- disk, growing ~1,800 chunks/day) — the same shape as the disk-full → read-only
-- incident. We keep the lightweight metadata row here for the fast query paths
-- (list, per-session consolidation, sessionHasRecording, customer join, purge,
-- storage badge) and move the heavy event blob to S3, keyed by s3_key.
--
-- events stays nullable for a dual-read rollout: rows written before the cutover
-- still have their jsonb; new rows carry s3_key and an empty events array. Once
-- the backfill has moved every old blob to S3, events is uniformly empty.

alter table session_recordings add column if not exists s3_key text;

-- Reads filter by session_id (full replay) and page (heatmap); neither was
-- indexed. Add them now — cheap on the metadata-only table, and the row count
-- stays bounded once blobs live in S3.
create index if not exists idx_recordings_session on session_recordings (session_id);
create index if not exists idx_recordings_page on session_recordings (page);
create index if not exists idx_recordings_s3_pending
  on session_recordings (created_at)
  where s3_key is null;  -- backfill cursor: rows not yet on S3
