/**
 * Ads Council nightly pipeline cron — the pg_cron BACKUP tick for the
 * council's 00:02 Manila run (doctrine §5/§8). The PRIMARY trigger is the
 * daily-summary cron's inline `runCouncilPipeline` call (16:02 UTC); this
 * route re-runs the exact same idempotent pipeline a bit later (16:20 UTC =
 * 00:20 Manila, vercel.json) so a delayed/failed daily-summary tick doesn't
 * silently skip a night's grading. `runCouncilPipeline` is safe to call
 * twice in one Manila day — the second call detects the first one already
 * ran (via `pipelineRanToday`) and just recomposes the brief from stored
 * verdicts instead of re-grading.
 */

import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron';
import { runCouncilPipeline } from '@/lib/council/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result = await runCouncilPipeline('BOSS');
  return NextResponse.json(result);
}
