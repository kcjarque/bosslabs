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

export type ClickEvent = {
  contactId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  linkTag: string;
  channel: 'email' | 'sms';
  createdAt: string;
};

/**
 * Every click on a tagged link (optionally one tag), newest first, with the
 * person resolved from signups in a single batched query (no N+1). Powers the
 * /admin/machine/clicks drill-down — who tapped, exactly when, on which channel.
 * All-time by default so the list is the complete picture behind a metric.
 */
export async function listClickEvents(tag: string | null, limit = 500): Promise<ClickEvent[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  let q = sb
    .from('engagement_events')
    .select('contact_id, link_tag, channel, created_at')
    .eq('event', 'click')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (tag) q = q.eq('link_tag', tag);
  const { data, error } = await q;
  if (error || !data) return [];
  const rows = data as Array<{ contact_id: string | null; link_tag: string | null; channel: string | null; created_at: string }>;

  const ids = [...new Set(rows.map((r) => r.contact_id).filter((x): x is string => Boolean(x)))];
  const people: Record<string, { name: string; email: string | null; phone: string | null }> = {};
  if (ids.length) {
    const { data: sig } = await sb.from('signups').select('id, first_name, last_name, email, phone').in('id', ids);
    for (const s of (sig ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }>) {
      const name = [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
      people[s.id] = { name, email: s.email, phone: s.phone };
    }
  }

  return rows.map((r) => {
    const p = r.contact_id ? people[r.contact_id] : undefined;
    return {
      contactId: r.contact_id,
      name: p?.name ?? 'Unknown contact',
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      linkTag: r.link_tag ?? '(untagged)',
      channel: (r.channel === 'sms' ? 'sms' : 'email') as 'email' | 'sms',
      createdAt: r.created_at,
    };
  });
}
