# Session recordings → Amazon S3 (off Supabase Postgres)

**Date:** 2026-07-18 · **Status:** approved-in-principle, pending spec review

## Problem

rrweb session recordings are stored as `jsonb` in Postgres (`session_recordings.events`).
That table is **1,683 MB on disk — ~97% of the entire 1,726 MB database**, growing
**~1,788 chunks/day**, and is the same shape as the earlier disk-full → read-only →
checkouts-down incident. Blobs don't belong in Postgres.

## Goal

Move the heavy rrweb blob to a private **S3 bucket** while keeping every existing
read/consolidation/heatmap/purge/customer-join path working. Free the ~1.6 GB now.
No user-visible change to the admin replay experience.

## Architecture — Hybrid (metadata in Postgres, blob in S3)

- **Keep** the `session_recordings` row as lightweight **metadata**: `id, session_id,
  page, size_bytes, created_at` + **new column `s3_key text`**. Row shrinks from ~1 MB
  to a few hundred bytes.
- **Drop the blob from Postgres**: `events jsonb` is nulled (kept as a nullable column
  for backward-compat during rollout, then always null for new rows).
- **Blob → S3**, gzipped, key `recordings/<session_id>/<chunk_id>.json.gz`, in a private
  bucket `bosslabs-recordings` (region `ap-southeast-2`, same as SES; reuses the AWS
  creds already in Vercel). No public access; all reads are admin-gated + server-side.

### What changes vs. what stays

| Path | Today | After |
|---|---|---|
| Ingest `saveRecording()` (`lib/db.ts`) | INSERT events jsonb | gzip+PUT to S3, INSERT metadata row w/ `s3_key`, `events`=null |
| List `getRecordings()` | metadata only (already omits events) | **unchanged** |
| Consolidation "one row per visit" (`app/admin/recordings/page.tsx`) | in-memory group by session | **unchanged** (runs on metadata) |
| `sessionHasRecording` (Telegram gate) | `select id where session_id` | **unchanged** |
| Customer join `getCustomersBySession` | signups metadata | **unchanged** |
| Storage badge `sum_recording_bytes` | sum size_bytes | **unchanged** |
| Full replay `getSessionChunks` (`session/[id]`) | read events from PG | read metadata → **GET blobs from S3 in parallel**, gunzip, hand to ReplayViewer |
| Single-chunk `getRecording` | read events from PG | read metadata → GET one S3 blob |
| Heatmap `getChunksForPage` (`lib/recordings-heatmap.ts`) | read events from PG | read metadata → GET ≤150 blobs from S3 in parallel, gunzip, same parser |

Only the **event-blob fetch** moves. The replay viewer, heatmap parser, consolidation,
tabs, Telegram gate — all untouched. Blast radius is `lib/db.ts` recording helpers + a
new tiny `lib/recordings-s3.ts`.

## New module: `lib/recordings-s3.ts`

- `putRecordingBlob(key, events[]) → void` — gzip JSON, `PutObjectCommand`.
- `getRecordingBlob(key) → events[]` — `GetObjectCommand`, gunzip, parse.
- `getRecordingBlobs(keys[]) → events[][]` — parallel (bounded concurrency ~10).
- `deleteRecordingBlobs(keys[]) → void` — `DeleteObjectsCommand` (batched ≤1000).
- Singleton `S3Client` mirroring `lib/ses.ts` (same creds/region resolution).
- New dep: `@aws-sdk/client-s3` (SES SDK is already present; core transitive deps shared).

## Retention (unchanged rules, now S3-aware)

Current SQL (extracted from cloud — **not previously in the repo**, will be committed as a migration):
- `purge_idle_recordings(10)` — deletes sessions spanning >10 min not linked to a
  paid/attended signup.
- `purge_old_recordings(5)` — deletes non-purchase recordings older than 5 days;
  paid/attended/no-show kept.

Change: both functions **also `RETURN` the deleted rows' `s3_key`s**, and the daily
cron (`app/api/cron/daily-summary`) calls `deleteRecordingBlobs()` on them after the
row delete. No blanket S3 lifecycle expiry (it can't tell paid from unpaid and would
wrongly delete kept recordings); optionally a long backstop lifecycle rule only for
orphaned keys. Retention behavior is otherwise identical to today.

## One-time backfill (14,693 chunks / 1,577 sessions)

Standalone script (`scripts/backfill-recordings-s3.mjs`), idempotent + safe-ordered:
1. Page through rows where `s3_key is null and events is not null` (batches of ~200).
2. For each: gzip+PUT events to S3 → on success, UPDATE row `s3_key=…, events='[]'`.
   **Never null events before the S3 PUT is confirmed.** Re-runnable (skips rows that
   already have `s3_key`).
3. After all rows migrated: reclaim disk. Nulling a TOASTed column marks dead tuples but
   doesn't shrink the file — run `VACUUM FULL session_recordings` (brief exclusive lock;
   run at low-traffic Manila hour) **or** `pg_repack` (no long lock) to return ~1.6 GB.

## Rollout order (recordings never break mid-migration)

1. Create bucket + verify IAM (see Risks). Add `RECORDINGS_S3_BUCKET` env.
2. Add `lib/recordings-s3.ts` + `@aws-sdk/client-s3`; migration adds `s3_key` column.
3. Ship **dual-read** first: reads prefer S3 when `s3_key` set, else fall back to
   `events` jsonb. (Old rows still readable during backfill.)
4. Switch ingest to S3-write. New chunks now land in S3 only.
5. Run backfill script → all old rows get `s3_key`, events emptied.
6. Commit purge migration (return s3_keys) + wire cron S3-delete.
7. `VACUUM FULL` / pg_repack to reclaim disk. Verify DB size drops.

## Config / env

- `RECORDINGS_S3_BUCKET=bosslabs-recordings` (Vercel).
- Reuse existing `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`(=SES region
  ap-southeast-2). **Region for S3 must match the bucket's region.**

## Risks / open items

1. **IAM S3 permissions** — the Vercel AWS creds today are scoped for SES. They likely
   **lack** `s3:PutObject/GetObject/DeleteObject/ListBucket` on the new bucket. Must add
   an IAM policy (or a bucket policy) granting that principal access to
   `bosslabs-recordings`. **Blocking dependency** — verify before ingest cutover.
2. **Purge SQL was untracked** — now captured above; will be committed as a real migration.
3. **VACUUM FULL lock** — reclaiming disk briefly locks the table; schedule off-peak.
4. **Heatmap latency** — ≤150 S3 GETs per heatmap load. Parallelized it's fine (~sub-second);
   precomputation is a later optimization, out of scope here.

## Verification

- Ingest: new checkout visit → chunk lands in S3, PG row has `s3_key`, `events` empty.
- Replay: open an S3-backed session in admin → plays identically; heatmap renders.
- Purge: run cron → rows + matching S3 objects both gone; paid kept.
- Disk: `pg_total_relation_size('session_recordings')` drops from ~1.6 GB to a few MB.
