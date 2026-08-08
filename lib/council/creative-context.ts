/**
 * Ad creative-context extractor — gives the Ads Council understanding of WHAT
 * the creative is (format/angle/persona/hook/quality), not just its numbers.
 *
 * Pipeline per ad:
 *   /{ad_id}/adcreatives  →  image → Claude vision
 *                            video → page-token → video source → ffmpeg
 *                                    (3 keyframes + audio) → Whisper transcript
 *                                    → Claude vision(frames + transcript + copy)
 *   → structured context → upsert ad_creative_context (idempotent by creative_hash).
 *
 * Never throws — every failure returns { error }. Service-role only.
 * Adapted lean from BrandHub's tag-meta-ad pipeline.
 */
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import OpenAI from 'openai';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { extractJson } from './session';
import type { Brand } from './types';

const GRAPH = process.env.META_GRAPH_VERSION || 'v23.0';
const ACCT = process.env.META_ADS_ACCOUNT_ID || '118264717761938';
const PAGE_NAME = 'BossLabs.AI'; // the FB Page that owns the video creatives
const VISION_MODEL = process.env.COUNCIL_MODEL || 'claude-sonnet-5';
// ffmpeg is used only where a real binary exists: the local backfill (homebrew
// or FFMPEG_PATH). On Vercel neither is present, so extractVideo() throws and
// analyzeAdCreative() falls back to the video's poster thumbnail — full-fidelity
// video (keyframes + transcript) is the backfill script's job, not serverless'.
const FFMPEG = process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || '/opt/homebrew/bin/ffprobe';

export type CreativeContext = {
  adId: string;
  creativeId: string | null;
  mediaType: 'video' | 'image' | 'other';
  format: string;
  angle: string;
  persona: string;
  awarenessLevel: string;
  hookText: string;
  transcript: string;
  visualQuality: number | null;
  onBrand: boolean | null;
  tags: string[];
  confidence: number | null;
  creativeHash: string;
};

type AdCreative = {
  creativeId: string | null;
  objectType: string | null;
  videoId: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  copy: string;
};

/* ── Meta fetches ──────────────────────────────────────────────────────── */

function metaToken(): string {
  const t = process.env.META_ADS_TOKEN;
  if (!t) throw new Error('META_ADS_TOKEN not set');
  return t;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** fetch with exponential backoff. Meta throttles aggressive adcreatives +
 *  video pulls, and undici surfaces the connection reset as a THROWN
 *  "fetch failed" / "terminated" (not an HTTP status), which is exactly the
 *  contiguous-tail failure the first backfill hit. Retries the throw. */
async function fetchRetry(url: string, init?: RequestInit, tries = 4): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fetch(url, init); }
    catch (e) { lastErr = e; await sleep(600 * 2 ** i); }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetch failed');
}

/** Download a URL to a Buffer with retry — both the fetch AND the streamed
 *  .arrayBuffer() can throw "terminated" mid-body under load. */
async function downloadBuffer(url: string, tries = 4): Promise<Buffer> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try { return Buffer.from(await (await fetch(url)).arrayBuffer()); }
    catch (e) { lastErr = e; await sleep(600 * 2 ** i); }
  }
  throw lastErr instanceof Error ? lastErr : new Error('download failed');
}

/** Meta's field-expansion is type-fragile: requesting ANY subfield a given
 *  creative's object_type doesn't support (e.g. `link_data{image_url}` on a
 *  video creative) fails the WHOLE call with "#100 nonexisting field". So we
 *  request the rich fields, and on a #100 fall back to a minimal set that is
 *  valid on every creative (thumbnail_url is a real ad render — video poster
 *  or the image itself — and fully covers the vision path). Returns the raw
 *  creative object, null (no creative), or 'field_error' (caller retries). */
async function fetchCreativeFields(adId: string, fields: string): Promise<Record<string, unknown> | null | 'field_error'> {
  const url = `https://graph.facebook.com/${GRAPH}/${adId}/adcreatives?fields=${fields}&access_token=${metaToken()}`;
  const res = await fetchRetry(url, { cache: 'no-store' });
  const json = (await res.json()) as { data?: Record<string, unknown>[]; error?: { message: string; code?: number } };
  if (json.error) {
    if (json.error.code === 100) return 'field_error';
    throw new Error(`adcreatives: ${json.error.message}`);
  }
  return json.data?.[0] ?? null;
}

/** The `ads{creative{}}` field-expansion returns null on this shared account —
 *  the /{ad_id}/adcreatives EDGE is the one that works (confirmed 2026-08-08). */
export async function fetchAdCreative(adId: string): Promise<AdCreative | null> {
  const RICH = 'id,object_type,video_id,thumbnail_url,body,title,object_story_spec{video_data{video_id,message},link_data{message,image_url}},asset_feed_spec{videos,images,bodies,titles}';
  const SAFE = 'id,object_type,video_id,thumbnail_url,body,title';
  let c = await fetchCreativeFields(adId, RICH);
  if (c === 'field_error') c = await fetchCreativeFields(adId, SAFE);
  if (c === 'field_error' || !c) return null;
  const oss = (c.object_story_spec ?? {}) as Record<string, any>;
  const afs = (c.asset_feed_spec ?? {}) as Record<string, any>;
  const videoId = (c.video_id as string) || oss.video_data?.video_id || afs.videos?.[0]?.video_id || null;
  const copy = String(
    (c.body as string) || oss.video_data?.message || oss.link_data?.message || afs.bodies?.[0]?.text || c.title || '',
  ).slice(0, 1200);
  return {
    creativeId: (c.id as string) ?? null,
    objectType: (c.object_type as string) ?? null,
    videoId,
    imageUrl: oss.link_data?.image_url || afs.images?.[0]?.url || null,
    thumbnailUrl: (c.thumbnail_url as string) ?? null,
    copy,
  };
}

let _pageToken: string | null = null;
/** Video `source` requires the owning Page's access token (Page assigned to the
 *  system user). Resolve once from /me/accounts and cache for the run. */
async function getPageToken(): Promise<string | null> {
  if (_pageToken) return _pageToken;
  const url = `https://graph.facebook.com/${GRAPH}/me/accounts?fields=id,name,access_token&limit=50&access_token=${metaToken()}`;
  const res = await fetchRetry(url, { cache: 'no-store' });
  const json = (await res.json()) as { data?: { name: string; access_token: string }[] };
  const page = json.data?.find((p) => p.name === PAGE_NAME) ?? json.data?.[0];
  _pageToken = page?.access_token ?? null;
  return _pageToken;
}

async function fetchVideoSource(videoId: string): Promise<string | null> {
  const token = (await getPageToken()) || metaToken();
  const url = `https://graph.facebook.com/${GRAPH}/${videoId}?fields=source&access_token=${token}`;
  const res = await fetchRetry(url, { cache: 'no-store' });
  const json = (await res.json()) as { source?: string; error?: { message: string } };
  return json.source ?? null;
}

/* ── ffmpeg (local system binary; Vercel sets FFMPEG_PATH to the installer) ─ */

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: 'ignore' });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exit ${code}`))));
  });
}

async function probeDuration(file: string): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', () => resolve(Number(out.trim()) || 0));
    p.on('error', () => resolve(0));
  });
}

/** Download video → 3 keyframes (jpeg base64) + mono 16k mp3 audio path. */
async function extractVideo(sourceUrl: string, dir: string): Promise<{ frames: string[]; audioPath: string | null }> {
  const videoPath = path.join(dir, 'v.mp4');
  const buf = await downloadBuffer(sourceUrl);
  await fs.writeFile(videoPath, buf);
  const dur = await probeDuration(videoPath);
  const stamps = dur > 3 ? [1, Math.max(2, dur / 2), Math.max(3, dur - 1)] : [0, Math.max(0.5, dur / 2), dur];
  const frames: string[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const fp = path.join(dir, `f${i}.jpg`);
    try {
      await run(FFMPEG, ['-ss', String(stamps[i].toFixed(2)), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=640:-1', '-q:v', '4', '-y', fp]);
      frames.push((await fs.readFile(fp)).toString('base64'));
    } catch { /* skip a bad frame */ }
  }
  let audioPath: string | null = path.join(dir, 'a.mp3');
  try {
    await run(FFMPEG, ['-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', '-y', audioPath]);
  } catch { audioPath = null; }
  return { frames, audioPath };
}

/* ── Whisper + Claude ──────────────────────────────────────────────────── */

async function transcribe(audioPath: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const r = await openai.audio.transcriptions.create({
    file: (await import('fs')).createReadStream(audioPath) as unknown as File,
    model: 'whisper-1',
  });
  return (r.text || '').slice(0, 4000);
}

const TAXONOMY = `You analyze ONE Facebook ad creative for a Filipino AI-coding webinar (₱999 → retreat → done-for-you builds; market = PH SME owners; Taglish; "bawal hao shao" = no hype/scammy claims).
Return ONLY a JSON object:
{"format": "video-testimonial|video-walkthrough|video-talkinghead|static-testimonial|static-graphic|carousel|other",
 "angle": "testimonial|urgency|income-claim|problem-aware|objection|education|founder|proof-build|lifestyle|other",
 "persona": "resto-owner|ofw|agency-owner|corporate-escapee|tita-tito|student|general",
 "awareness_level": "unaware|problem-aware|solution-aware|product-aware|most-aware",
 "hook_text": "the first line / opening spoken words, verbatim, <=120 chars",
 "visual_quality": 1-5 (production quality),
 "on_brand": true/false (true = Taglish, real/credible, no hype/AI-slop),
 "tags": ["short","descriptive"],
 "confidence": 0.0-1.0}
Base it on the frames + transcript + ad copy provided. No prose outside the JSON.`;

async function claudeVision(frames: string[], transcript: string, copy: string): Promise<Record<string, unknown>> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const content: unknown[] = frames.map((b64) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }));
  content.push({ type: 'text', text: `AD COPY:\n${copy || '(none)'}\n\nTRANSCRIPT:\n${transcript || '(none / static image)'}` });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: VISION_MODEL, max_tokens: 1024, system: TAXONOMY, thinking: { type: 'disabled' }, messages: [{ role: 'user', content }] }),
  });
  const json = (await res.json()) as { content?: { text?: string }[]; error?: { message: string } };
  if (json.error) throw new Error(`anthropic: ${json.error.message}`);
  return JSON.parse(extractJson(json.content?.[0]?.text ?? '{}'));
}

async function imageToBase64(url: string): Promise<string | null> {
  try { return (await downloadBuffer(url)).toString('base64'); } catch { return null; }
}

/* ── Council read ──────────────────────────────────────────────────────── */

/** Compact creative-strategy view for the council pack — deliberately drops
 *  the transcript and hash so the JSON.stringify'd LLM prompt stays lean
 *  (the full transcript lives in the DB for the Advise drawer). */
export type CreativeBrief = {
  mediaType: string; format: string; angle: string; persona: string;
  awarenessLevel: string; hook: string; visualQuality: number | null;
  onBrand: boolean | null; tags: string[];
};

/** ad_id → CreativeBrief for every analyzed ad in the brand. Empty map when
 *  Supabase isn't configured (dev/test) — the council degrades to numbers-only. */
export async function getCreativeBriefs(brand: Brand = 'BOSS'): Promise<Map<string, CreativeBrief>> {
  if (!isSupabaseConfigured()) return new Map();
  const { data } = await getSupabase()
    .from('ad_creative_context')
    .select('ad_id, media_type, format, angle, persona, awareness_level, hook_text, visual_quality, on_brand, tags')
    .eq('brand', brand);
  const m = new Map<string, CreativeBrief>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    m.set(r.ad_id as string, {
      mediaType: String(r.media_type ?? ''), format: String(r.format ?? ''),
      angle: String(r.angle ?? ''), persona: String(r.persona ?? ''),
      awarenessLevel: String(r.awareness_level ?? ''), hook: String(r.hook_text ?? ''),
      visualQuality: typeof r.visual_quality === 'number' ? r.visual_quality : null,
      onBrand: typeof r.on_brand === 'boolean' ? r.on_brand : null,
      tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : [],
    });
  }
  return m;
}

/** Full creative detail for one ad — powers the Advise drawer (adds
 *  transcript + confidence + analyzed-at on top of the compact brief). */
export type CreativeDetail = CreativeBrief & {
  transcript: string; confidence: number | null; analyzedAt: string | null;
};
export async function getCreativeContext(adId: string): Promise<CreativeDetail | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase()
    .from('ad_creative_context')
    .select('media_type, format, angle, persona, awareness_level, hook_text, visual_quality, on_brand, tags, transcript, confidence, analyzed_at')
    .eq('ad_id', adId)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    mediaType: String(r.media_type ?? ''), format: String(r.format ?? ''),
    angle: String(r.angle ?? ''), persona: String(r.persona ?? ''),
    awarenessLevel: String(r.awareness_level ?? ''), hook: String(r.hook_text ?? ''),
    visualQuality: typeof r.visual_quality === 'number' ? r.visual_quality : null,
    onBrand: typeof r.on_brand === 'boolean' ? r.on_brand : null,
    tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : [],
    transcript: String(r.transcript ?? ''),
    confidence: typeof r.confidence === 'number' ? r.confidence : null,
    analyzedAt: r.analyzed_at ? String(r.analyzed_at) : null,
  };
}

/** Nightly capped pickup: analyze at most `cap` eligible ads that have NO
 *  context row yet (brand-new creatives). Bounded by design — the heavy
 *  video path (~20s/ad) must never blow the pipeline's maxDuration, and
 *  full re-analysis / changed-creative refresh is the backfill script's job
 *  (`scripts/analyze-creatives.ts --force`), not the nightly step. Never
 *  throws; returns a small summary for logging. */
export async function analyzeMissingCreatives(
  brand: Brand,
  ads: { adId: string; adName: string }[],
  cap = 5,
): Promise<{ analyzed: number; failed: number }> {
  if (!isSupabaseConfigured() || ads.length === 0) return { analyzed: 0, failed: 0 };
  const { data } = await getSupabase().from('ad_creative_context').select('ad_id').eq('brand', brand);
  const have = new Set(((data ?? []) as { ad_id: string }[]).map((r) => r.ad_id));
  const missing = ads.filter((a) => !have.has(a.adId)).slice(0, cap);
  let analyzed = 0, failed = 0;
  for (const a of missing) {
    const r = await analyzeAdCreative(a.adId, a.adName, brand);
    if ('ok' in r) analyzed++;
    else if (r.error !== 'unchanged') failed++;
  }
  return { analyzed, failed };
}

/* ── Orchestrator ──────────────────────────────────────────────────────── */

function hashOf(c: AdCreative): string {
  return crypto.createHash('sha1').update(`${c.videoId ?? ''}|${c.imageUrl ?? ''}|${c.thumbnailUrl ?? ''}`).digest('hex').slice(0, 16);
}

/** Analyze one ad's creative + upsert. Returns the context or { error }.
 *  force=false skips ads whose creative_hash is unchanged (idempotent). */
export async function analyzeAdCreative(
  adId: string,
  adName: string,
  brand: Brand = 'BOSS',
  opts: { force?: boolean } = {},
): Promise<{ ok: true; context: CreativeContext } | { error: string }> {
  const sb = getSupabase();
  let cr: AdCreative | null;
  try { cr = await fetchAdCreative(adId); } catch (e) { return { error: e instanceof Error ? e.message : 'fetch failed' }; }
  if (!cr) return { error: 'no_creative' };

  const creativeHash = hashOf(cr);
  if (!opts.force) {
    const { data } = await sb.from('ad_creative_context').select('creative_hash').eq('ad_id', adId).maybeSingle();
    if (data && (data as { creative_hash: string }).creative_hash === creativeHash) return { error: 'unchanged' };
  }

  const isVideo = Boolean(cr.videoId);
  const mediaType: CreativeContext['mediaType'] = isVideo ? 'video' : cr.imageUrl || cr.thumbnailUrl ? 'image' : 'other';
  let frames: string[] = [];
  let transcript = '';

  try {
    if (isVideo) {
      const src = await fetchVideoSource(cr.videoId!);
      if (src) {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-'));
        try {
          const ex = await extractVideo(src, dir);
          frames = ex.frames;
          if (ex.audioPath && process.env.OPENAI_API_KEY) {
            try { transcript = await transcribe(ex.audioPath); } catch { /* transcript optional */ }
          }
        } finally { await fs.rm(dir, { recursive: true, force: true }); }
      }
      if (frames.length === 0) { // source unreachable → thumbnail fallback
        const b = cr.thumbnailUrl ? await imageToBase64(cr.thumbnailUrl) : null;
        if (b) frames = [b];
      }
    } else {
      const b = await imageToBase64(cr.imageUrl || cr.thumbnailUrl || '');
      if (b) frames = [b];
    }
  } catch (e) { return { error: e instanceof Error ? e.message : 'extract failed' }; }

  if (frames.length === 0) return { error: 'no_frames' };

  let parsed: Record<string, unknown>;
  try { parsed = await claudeVision(frames, transcript, cr.copy); } catch (e) { return { error: e instanceof Error ? e.message : 'vision failed' }; }

  const context: CreativeContext = {
    adId, creativeId: cr.creativeId, mediaType,
    format: String(parsed.format ?? ''), angle: String(parsed.angle ?? ''),
    persona: String(parsed.persona ?? ''), awarenessLevel: String(parsed.awareness_level ?? ''),
    hookText: String(parsed.hook_text ?? '').slice(0, 200), transcript,
    visualQuality: typeof parsed.visual_quality === 'number' ? parsed.visual_quality : null,
    onBrand: typeof parsed.on_brand === 'boolean' ? parsed.on_brand : null,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 12) : [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    creativeHash,
  };

  const { error } = await sb.from('ad_creative_context').upsert({
    brand, ad_id: adId, creative_id: context.creativeId, ad_name: adName, media_type: mediaType,
    format: context.format, angle: context.angle, persona: context.persona, awareness_level: context.awarenessLevel,
    hook_text: context.hookText, transcript, visual_quality: context.visualQuality, on_brand: context.onBrand,
    tags: context.tags, model: VISION_MODEL, confidence: context.confidence, creative_hash: creativeHash,
    analyzed_at: new Date().toISOString(),
  }, { onConflict: 'ad_id' });
  if (error) return { error: `upsert: ${error.message}` };
  return { ok: true, context };
}
