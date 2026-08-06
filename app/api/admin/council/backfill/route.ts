import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { syncAdMetricsDaily } from '@/lib/council/meta-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** POST { since?: 'YYYY-MM-DD' } — full-history backfill in 30-day chunks.
 *  Default since: 2026-05-01 (before first BOSSLABS spend). Re-runnable. */
export async function POST(req: Request) {
  requireAdmin();
  const body = (await req.json().catch(() => ({}))) as { since?: string };
  const since = body.since ?? '2026-05-01';
  const today = new Date().toISOString().slice(0, 10);
  const chunks: { since: string; until: string }[] = [];
  for (let t = Date.parse(since); t <= Date.parse(today); t += 30 * 86400000) {
    const u = Math.min(t + 29 * 86400000, Date.parse(today));
    chunks.push({ since: new Date(t).toISOString().slice(0, 10), until: new Date(u).toISOString().slice(0, 10) });
  }
  const out: { chunk: string; rows: number; ads: number }[] = [];
  for (const c of chunks) {
    const r = await syncAdMetricsDaily(c);
    out.push({ chunk: `${c.since}..${c.until}`, ...r });
  }
  return NextResponse.json({ ok: true, chunks: out });
}
