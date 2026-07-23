/**
 * One-time backfill: move existing rrweb blobs from Postgres → S3.
 *
 * Self-consuming queue: repeatedly grabs a page of rows where `s3_key is null`,
 * gzip+PUTs each row's `events` to S3, then (only after the PUT confirms) sets
 * `s3_key` and empties `events`. Idempotent + re-runnable — a row drops out of
 * the queue the moment its s3_key is set, so a crash/restart just resumes.
 *
 * Reads config from bosslabs-ai/.env.local (Supabase service key + AWS creds +
 * RECORDINGS_S3_BUCKET). Run AFTER the bucket exists and the IAM policy is on.
 *
 *   node scripts/backfill-recordings-s3.mjs
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// A stale keep-alive HTTP/2 socket to Supabase can fire its own timeout well
// after the request that used it has already resolved (observed: "stream
// timeout after 300000" as an uncaught rejection with no live await to catch
// it). That's unrelated to any specific row — every actual mutation below is
// already isolated in its own try/catch — so log and keep going instead of
// letting a stray background event kill an otherwise-healthy backfill run.
process.on('unhandledRejection', (err) => {
  console.warn('[backfill] unhandled rejection (continuing):', err?.message ?? err);
});
process.on('uncaughtException', (err) => {
  console.warn('[backfill] uncaught exception (continuing):', err?.message ?? err);
});

// ── config from .env.local ───────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = env.RECORDINGS_S3_BUCKET || 'bosslabs-recordings';
const REGION = env.AWS_REGION || 'ap-southeast-2';
for (const [k, v] of [['SUPA_URL', SUPA_URL], ['SUPA_KEY', SUPA_KEY], ['BUCKET', BUCKET]]) {
  if (!v) throw new Error(`missing ${k}`);
}

const s3 = new S3Client({
  region: REGION,
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
  maxAttempts: 3,
});

const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };
const PAGE = 20; // rows (with events) pulled per batch — keeps response size sane
const PUT_CONCURRENCY = 5;

function recordingKey(sessionId, id) {
  const safe = (s) => String(s).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `recordings/${safe(sessionId)}/${safe(id)}.json.gz`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retry a flaky network call with backoff. The observed failure mode is an
 *  upstream 5xx blip (Supabase's Cloudflare edge returning "521 web server is
 *  down" for a few seconds under load) — transient, not a data problem — so
 *  retrying beats aborting the whole run. */
async function withRetry(fn, { attempts = 5, baseMs = 1000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const wait = baseMs * 2 ** i;
        console.warn(`  ⚠ retry ${i + 1}/${attempts - 1} after ${wait}ms: ${err.message.slice(0, 120)}`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

async function fetchPage() {
  const url =
    `${SUPA_URL}/rest/v1/session_recordings` +
    `?s3_key=is.null&select=id,session_id,events&order=created_at.asc&limit=${PAGE}`;
  return withRetry(async () => {
    const res = await fetch(url, { headers: H });
    if (!res.ok) throw new Error(`fetchPage ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  });
}

async function migrateRow(row) {
  const key = recordingKey(row.session_id, row.id);
  const body = gzipSync(Buffer.from(JSON.stringify(row.events ?? []), 'utf8'));
  // 1) PUT to S3 (SDK already retries transient errors internally). Must
  //    succeed before we touch Postgres.
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      ContentEncoding: 'gzip',
    }),
  );
  // 2) Only now: set s3_key + empty the jsonb. Retried — a PUT that already
  //    landed shouldn't get stuck behind a flaky PATCH (re-running the PUT
  //    for the same deterministic key is a harmless overwrite either way).
  await withRetry(async () => {
    const res = await fetch(`${SUPA_URL}/rest/v1/session_recordings?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ s3_key: key, events: [] }),
    });
    if (!res.ok) throw new Error(`PATCH ${row.id} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  });
}

let migrated = 0;
let failed = 0;
const t0 = Date.now();
console.log(`Backfill → s3://${BUCKET} (${REGION})`);
for (;;) {
  const rows = await fetchPage();
  if (rows.length === 0) break;
  // process the page with bounded concurrency
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(PUT_CONCURRENCY, rows.length) }, async () => {
      while (i < rows.length) {
        const row = rows[i++];
        try {
          await migrateRow(row);
          migrated++;
        } catch (err) {
          failed++;
          console.warn(`  ✗ ${row.id}: ${err.message}`);
        }
      }
    }),
  );
  const rate = Math.round(migrated / ((Date.now() - t0) / 1000));
  console.log(`  migrated ${migrated} · failed ${failed} · ~${rate}/s`);
  // Safety: if a whole page failed (e.g. perms revoked), stop rather than spin.
  if (failed > 0 && migrated === 0) throw new Error('first page all failed — aborting (check IAM/bucket)');
}
console.log(`\nDone. migrated=${migrated} failed=${failed} in ${Math.round((Date.now() - t0) / 1000)}s`);
if (failed > 0) console.log('Re-run to retry the failed rows (they still have s3_key=null).');
