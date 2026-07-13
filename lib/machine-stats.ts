/**
 * Measurement dashboard stats (SPEC §8) — reads the now-live engine so we never
 * argue "is it working" from vibes. Only surfaces what's genuinely measurable
 * today (list state, interest tags, clicks, survey, attendance); SOS / DFY /
 * vault-downsell / reviews land as those features ship.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { getEmailTemplates } from './db';

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
  /** The email this link was clicked from — template key + friendly name.
   *  Null for clicks logged before source-template capture, or for SMS. */
  templateKey: string | null;
  templateName: string | null;
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
    .select('contact_id, link_tag, template_key, channel, created_at')
    .eq('event', 'click')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (tag) q = q.eq('link_tag', tag);
  const { data, error } = await q;
  if (error || !data) return [];
  const rows = data as Array<{
    contact_id: string | null;
    link_tag: string | null;
    template_key: string | null;
    channel: string | null;
    created_at: string;
  }>;

  const ids = [...new Set(rows.map((r) => r.contact_id).filter((x): x is string => Boolean(x)))];
  const people: Record<string, { name: string; email: string | null; phone: string | null }> = {};
  if (ids.length) {
    const { data: sig } = await sb.from('signups').select('id, first_name, last_name, email, phone').in('id', ids);
    for (const s of (sig ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }>) {
      const name = [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
      people[s.id] = { name, email: s.email, phone: s.phone };
    }
  }

  // Resolve template keys to friendly names (best-effort; unknown keys show raw).
  const tmplName: Record<string, string> = {};
  try {
    for (const t of await getEmailTemplates()) tmplName[t.id] = t.name;
  } catch {
    /* templates unavailable — fall back to raw key */
  }

  return rows.map((r) => {
    const p = r.contact_id ? people[r.contact_id] : undefined;
    return {
      contactId: r.contact_id,
      name: p?.name ?? 'Unknown contact',
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      linkTag: r.link_tag ?? '(untagged)',
      templateKey: r.template_key ?? null,
      templateName: r.template_key ? tmplName[r.template_key] ?? r.template_key : null,
      channel: (r.channel === 'sms' ? 'sms' : 'email') as 'email' | 'sms',
      createdAt: r.created_at,
    };
  });
}

export type DripRow = {
  templateId: string;
  name: string;
  subject: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  /** opened / delivered — subject-line health. */
  openRate: number;
  /** clicked / delivered — body/CTA health. */
  clickRate: number;
};

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, opened: 3, clicked: 4 };

/**
 * Per-email drip funnel from email_log: for each template, how many were sent,
 * delivered, opened and clicked (SES lifecycle, never-downgraded so the row's
 * status is the furthest it reached). Powers /admin/machine/drip so a weak
 * subject (low open rate) or weak body (low click rate) is obvious at a glance.
 * Aggregated in JS over paged reads — email_log is 2 tiny columns here.
 */
export async function getDripPerformance(): Promise<DripRow[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const agg: Record<string, { sent: number; delivered: number; opened: number; clicked: number; bounced: number }> = {};
  for (let from = 0; from <= 100_000; from += 1000) {
    const { data, error } = await sb
      .from('email_log')
      .select('template_id, status')
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    for (const r of data as Array<{ template_id: string | null; status: string | null }>) {
      const id = r.template_id;
      if (!id) continue; // skip untemplated raw sends / broadcasts
      const a = (agg[id] ??= { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 });
      a.sent++;
      const st = r.status ?? 'sent';
      if (st === 'bounced') {
        a.bounced++;
        continue;
      }
      const rank = STATUS_RANK[st] ?? 1;
      if (rank >= 2) a.delivered++;
      if (rank >= 3) a.opened++;
      if (rank >= 4) a.clicked++;
    }
    if (data.length < 1000) break;
  }

  const nameById: Record<string, { name: string; subject: string }> = {};
  try {
    for (const t of await getEmailTemplates()) nameById[t.id] = { name: t.name, subject: t.subject };
  } catch {
    /* templates unavailable — fall back to the raw id */
  }

  return Object.entries(agg)
    .map(([templateId, a]) => ({
      templateId,
      name: nameById[templateId]?.name ?? templateId,
      subject: nameById[templateId]?.subject ?? '',
      sent: a.sent,
      delivered: a.delivered,
      opened: a.opened,
      clicked: a.clicked,
      bounced: a.bounced,
      openRate: a.delivered ? a.opened / a.delivered : 0,
      clickRate: a.delivered ? a.clicked / a.delivered : 0,
    }))
    .sort((x, y) => y.sent - x.sent);
}
