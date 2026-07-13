/**
 * Lifecycle cron (SPEC §5.3 / the 60-90 day model) — runs daily.
 *
 * Moves cold contacts through their send_state so the broadcast list stays a
 * warm list, not a graveyard:
 *   - Dormant 60-90 days  → enroll in "Win-back · Dormant" + send_state=in_winback
 *   - Dormant > 90 days    → send_state=sunset (stops broadcasting to the dead)
 *
 * "Dormant" = last_engaged_at (a tracked click) older than the threshold, or —
 * for contacts who never clicked — their signup date. Only LEADS are touched
 * (paid customers are never win-backed), and never the unsubscribed/suppressed
 * or anyone already in a real sequence (send_state != active_broadcast).
 *
 * SAFE BY DEFAULT: the whole cron no-ops unless "Win-back · Dormant" is ACTIVE,
 * so nothing changes state (or sends) until Kyle flips win-back on.
 */
import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron';
import { enrollByName } from '@/lib/sos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DAY = 24 * 60 * 60 * 1000;
const DORMANT_DAYS = 60;
const SUNSET_DAYS = 90;
const WINBACK_SEQUENCE = 'Win-back · Dormant';

type Row = {
  id: string;
  status: string | null;
  send_state: string | null;
  last_engaged_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, skipped: 'no supabase' });

  const sb = getSupabase();

  // Master gate: do nothing until the win-back sequence is live.
  const { data: seq } = await sb
    .from('sequences')
    .select('active')
    .eq('name', WINBACK_SEQUENCE)
    .maybeSingle();
  if (!seq || !(seq as { active: boolean }).active) {
    return NextResponse.json({ ok: true, skipped: 'winback inactive' });
  }

  const now = Date.now();
  const { data } = await sb
    .from('signups')
    .select('id, status, send_state, last_engaged_at, created_at, metadata');
  const rows = (data ?? []) as Row[];

  const isCustomer = (s: string | null) => s === 'paid' || s === 'attended' || s === 'no-show';
  const totals = { scanned: rows.length, enrolledWinback: 0, sunset: 0 };

  for (const r of rows) {
    const state = r.send_state || 'active_broadcast';
    if (r.status === 'unsubscribed') continue;
    if ((r.metadata as { emailSuppressed?: string } | null)?.emailSuppressed) continue;
    if ((r.metadata as { standaloneOto?: boolean } | null)?.standaloneOto) continue;

    const lastMs = Date.parse(r.last_engaged_at || r.created_at);
    if (Number.isNaN(lastMs)) continue;
    const dormantDays = (now - lastMs) / DAY;

    // Sunset the truly dead (>90d) — stop broadcasting. Applies whether they're
    // still active_broadcast or already in win-back.
    if (dormantDays > SUNSET_DAYS && (state === 'active_broadcast' || state === 'in_winback')) {
      await sb.from('signups').update({ send_state: 'sunset' }).eq('id', r.id);
      totals.sunset++;
      continue;
    }

    // 60-90d dormant LEADS still broadcasting → win-back.
    if (
      dormantDays > DORMANT_DAYS &&
      dormantDays <= SUNSET_DAYS &&
      state === 'active_broadcast' &&
      !isCustomer(r.status)
    ) {
      const enrolled = await enrollByName(WINBACK_SEQUENCE, r.id);
      if (enrolled) {
        await sb.from('signups').update({ send_state: 'in_winback' }).eq('id', r.id);
        totals.enrolledWinback++;
      }
    }
  }

  return NextResponse.json({ ok: true, ...totals });
}
