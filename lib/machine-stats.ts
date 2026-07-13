/**
 * Measurement dashboard stats (SPEC §8) — reads the now-live engine so we never
 * argue "is it working" from vibes. Only surfaces what's genuinely measurable
 * today (list state, interest tags, clicks, survey, attendance); SOS / DFY /
 * vault-downsell / reviews land as those features ship.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export type MachineStats = {
  sendStates: Record<string, number>;
  interest: Record<string, number>;
  clicks: Array<{ linkTag: string; email: number; sms: number; total: number }>;
  survey: { responses: number; paid: number; pct: number };
  attendance: Array<{ eventId: string; eventName: string; attended: number }>;
};

const EMPTY: MachineStats = { sendStates: {}, interest: {}, clicks: [], survey: { responses: 0, paid: 0, pct: 0 }, attendance: [] };

export async function getMachineStats(): Promise<MachineStats> {
  if (!isSupabaseConfigured()) return EMPTY;
  const sb = getSupabase();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const [sig, eng, surv, events] = await Promise.all([
    sb.from('signups').select('send_state, interest_tags, status'),
    sb.from('engagement_events').select('link_tag, channel').eq('event', 'click').gte('created_at', since),
    sb.from('survey_responses').select('id', { count: 'exact', head: true }),
    sb.from('events').select('id, name').order('starts_at_iso', { ascending: false }).limit(4),
  ]);

  const sendStates: Record<string, number> = {};
  const interest: Record<string, number> = {};
  let paid = 0;
  for (const r of (sig.data ?? []) as Array<{ send_state?: string; interest_tags?: string[]; status?: string }>) {
    const st = r.send_state || 'active_broadcast';
    sendStates[st] = (sendStates[st] ?? 0) + 1;
    if (r.status === 'paid' || r.status === 'attended') paid++;
    for (const t of r.interest_tags ?? []) {
      const k = String(t).replace('interested:', '');
      interest[k] = (interest[k] ?? 0) + 1;
    }
  }

  const cmap: Record<string, { email: number; sms: number }> = {};
  for (const r of (eng.data ?? []) as Array<{ link_tag?: string; channel?: string }>) {
    const tag = r.link_tag || '(untagged)';
    cmap[tag] = cmap[tag] ?? { email: 0, sms: 0 };
    if (r.channel === 'sms') cmap[tag].sms++;
    else cmap[tag].email++;
  }
  const clicks = Object.entries(cmap)
    .map(([linkTag, v]) => ({ linkTag, email: v.email, sms: v.sms, total: v.email + v.sms }))
    .sort((a, b) => b.total - a.total);

  const responses = surv.count ?? 0;

  const attendance: Array<{ eventId: string; eventName: string; attended: number }> = [];
  for (const e of (events.data ?? []) as Array<{ id: string; name: string }>) {
    const { count } = await sb
      .from('event_attendance')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', e.id)
      .eq('attended', true);
    attendance.push({ eventId: e.id, eventName: e.name, attended: count ?? 0 });
  }

  return {
    sendStates,
    interest,
    clicks,
    survey: { responses, paid, pct: paid ? Math.round((responses / paid) * 100) : 0 },
    attendance,
  };
}
