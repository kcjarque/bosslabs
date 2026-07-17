/**
 * Session-recording blob storage on Amazon S3.
 *
 * rrweb event blobs used to live in Postgres (session_recordings.events jsonb) —
 * ~97% of the DB and the cause of the disk-full → read-only incident. They now
 * live in a private S3 bucket; Postgres keeps only the lightweight metadata row
 * (+ the s3_key pointer). Same client style as lib/ses.ts: a process-wide
 * singleton, region from AWS_REGION (default ap-southeast-2 = Sydney, matching
 * SES), credentials from the AWS default provider chain (env vars on Vercel).
 *
 * Blobs are gzipped (rrweb JSON compresses ~5–10×). Key layout:
 *   recordings/<sessionId>/<chunkId>.json.gz
 */
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** rrweb events are opaque objects to us — we only (de)serialize them. */
type RrwebEvent = Record<string, unknown>;

let sharedClient: S3Client | null = null;

function getS3Client(): S3Client {
  if (sharedClient === null) {
    const region = process.env.AWS_REGION || process.env.SES_REGION || 'ap-southeast-2';
    sharedClient = new S3Client({ region, maxAttempts: 3 });
  }
  return sharedClient;
}

/** Bucket that holds recording blobs. */
export function recordingsBucket(): string | undefined {
  return process.env.RECORDINGS_S3_BUCKET || undefined;
}

/** True when S3 recording storage is usable (creds + bucket configured). */
export function isRecordingsS3Configured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && recordingsBucket(),
  );
}

/** Deterministic object key for one chunk. `chunkId` is the row id. */
export function recordingKey(sessionId: string, chunkId: string): string {
  // Keep session/id path-safe — ids are our own alnum/hyphen strings, but guard
  // anyway so a weird id can never escape the recordings/ prefix.
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `recordings/${safe(sessionId)}/${safe(chunkId)}.json.gz`;
}

/** Gzip + upload one chunk's events. Returns the key written. */
export async function putRecordingBlob(key: string, events: RrwebEvent[]): Promise<string> {
  const bucket = recordingsBucket();
  if (!bucket) throw new Error('RECORDINGS_S3_BUCKET not set');
  const body = await gzipAsync(Buffer.from(JSON.stringify(events), 'utf8'));
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      ContentEncoding: 'gzip',
    }),
  );
  return key;
}

/** Download + gunzip one chunk's events. Returns [] on any failure so a single
 *  missing/corrupt blob degrades one chunk rather than breaking a whole replay. */
export async function getRecordingBlob(key: string): Promise<RrwebEvent[]> {
  const bucket = recordingsBucket();
  if (!bucket) return [];
  try {
    const res = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return [];
    // SDK v3 (Node): Body exposes transformToByteArray().
    const bytes = await (res.Body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    const json = (await gunzipAsync(Buffer.from(bytes))).toString('utf8');
    const parsed = JSON.parse(json) as RrwebEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[recordings-s3] getRecordingBlob failed:', key, err instanceof Error ? err.message : err);
    return [];
  }
}

/** Fetch many chunks in parallel with a small concurrency cap (heatmap pulls
 *  up to ~150). Preserves input order. */
export async function getRecordingBlobs(keys: string[], concurrency = 12): Promise<RrwebEvent[][]> {
  const out: RrwebEvent[][] = new Array(keys.length);
  let i = 0;
  async function worker() {
    while (i < keys.length) {
      const idx = i++;
      out[idx] = await getRecordingBlob(keys[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, worker));
  return out;
}

/** Delete blobs (batched at S3's 1000-key limit). Best-effort. */
export async function deleteRecordingBlobs(keys: string[]): Promise<void> {
  const bucket = recordingsBucket();
  if (!bucket || keys.length === 0) return;
  const client = getS3Client();
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000).map((Key) => ({ Key }));
    try {
      await client.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch, Quiet: true } }),
      );
    } catch (err) {
      console.warn('[recordings-s3] deleteRecordingBlobs batch failed:', err instanceof Error ? err.message : err);
    }
  }
}
