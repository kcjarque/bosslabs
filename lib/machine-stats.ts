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
 * Date open/click tracking (SES event webhook → email_log status) went live.
 * Emails sent before this were never measured, so the drip funnel only counts
 * sends from here forward — otherwise old, untracked sends would drag open/click
 * rates toward zero. Bump this if tracking ever breaks and is re-fixed.
 */
export const EMAIL_TRACKING_SINCE = '2026-07-12';

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
      .gte('created_at', EMAIL_TRACKING_SINCE)
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

/* ── Survey analytics (/admin/machine/survey) ────────────────────────────── */

// Mirrors the option labels shown in components/SurveyForm.tsx (q1/q2), with
// "Iba pa" rendered as "Other" for the admin (internal) view.
export const SURVEY_INDUSTRY_LABEL: Record<string, string> = {
  food_retail: 'Food / Retail',
  services: 'Services',
  construction: 'Construction / Engineering',
  healthcare: 'Clinic / Healthcare',
  education: 'Education / Training',
  professional_services: 'Accounting / Professional Services',
  real_estate: 'Real Estate / Rental',
  logistics_ops: 'Logistics / Operations',
  agency_freelance: 'Agency / Freelance',
  manufacturing: 'Manufacturing',
  other: 'Other',
};
export const SURVEY_PAIN_LABEL: Record<string, string> = {
  orders_tracking: 'Orders / tracking',
  manual_reports: 'Manual reports',
  inventory: 'Inventory / stocks',
  payments_collections: 'Payments / collections',
  followups: 'Follow-ups',
  team_visibility: 'Team visibility',
  other: 'Other',
};
export const SURVEY_TEAM_SIZE_LABEL: Record<string, string> = {
  solo: 'Just me',
  micro: '2–5',
  small: '6–20',
  mid: '21+',
};
export const SURVEY_TRIED_LABEL: Record<string, string> = {
  never: 'First time looking into it',
  abandoned: 'Started, never finished',
  manual_system: 'Manual / Excel system',
  has_software: 'Has software, wants upgrade',
};
export const SURVEY_INTENT_LABEL: Record<string, string> = {
  diy: 'DIY — wants to learn',
  diy_open: 'DIY, open to DFY',
  dfy: 'DFY — wants it done for them',
};

export type SurveyBreakdown = { key: string; label: string; count: number; pct: number };

export type SurveyResponseRow = {
  id: string;
  contactId: string | null;
  name: string;
  email: string | null;
  eventName: string;
  industryLabel: string;
  /** Elaboration when q1_industry = 'other'. */
  industryFreetext: string | null;
  painLabel: string;
  /** Elaboration when q2_pain = 'other'. */
  painFreetext: string | null;
  teamSizeLabel: string;
  triedLabel: string;
  /** Q5 — "first process you'd want to automate" (free text). */
  ideaFreetext: string | null;
  intent: string | null;
  intentLabel: string;
  createdAt: string;
};

export type SurveyData = {
  total: number;
  industry: SurveyBreakdown[];
  pain: SurveyBreakdown[];
  teamSize: SurveyBreakdown[];
  tried: SurveyBreakdown[];
  intent: SurveyBreakdown[];
  byEvent: Array<{ eventName: string; count: number }>;
  responses: SurveyResponseRow[];
};

const EMPTY_SURVEY: SurveyData = { total: 0, industry: [], pain: [], teamSize: [], tried: [], intent: [], byEvent: [], responses: [] };

function tally(values: Array<string | null>, labels: Record<string, string>): SurveyBreakdown[] {
  const counts: Record<string, number> = {};
  for (const v of values) {
    const k = v ?? 'unknown';
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const total = values.length;
  return Object.entries(counts)
    .map(([key, count]) => ({ key, label: labels[key] ?? 'Unknown', count, pct: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}

type RawSurveyRow = {
  id: string;
  contact_id: string | null;
  event_id: string | null;
  q1_industry: string | null;
  q1_freetext: string | null;
  q2_pain: string | null;
  q2_freetext: string | null;
  team_size: string | null;
  tried_before: string | null;
  q3_freetext: string | null;
  q4_intent: string | null;
  created_at: string;
};

/** Columns selected for both the dashboard + CSV — kept in one place so the two
 *  readers never drift. */
const SURVEY_SELECT =
  'id, contact_id, event_id, q1_industry, q1_freetext, q2_pain, q2_freetext, team_size, tried_before, q3_freetext, q4_intent, created_at';

/** Resolve raw survey_responses rows into displayable rows — respondent +
 *  event name in two batched queries (no N+1). Shared by the dashboard's
 *  capped getSurveyData and the uncapped CSV export below. */
async function resolveSurveyResponses(rows: RawSurveyRow[]): Promise<SurveyResponseRow[]> {
  const sb = getSupabase();
  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter((x): x is string => Boolean(x)))];
  const people: Record<string, { name: string; email: string | null }> = {};
  if (contactIds.length) {
    const { data: sig } = await sb.from('signups').select('id, first_name, last_name, email').in('id', contactIds);
    for (const s of (sig ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>) {
      const name = [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
      people[s.id] = { name, email: s.email };
    }
  }

  const eventIds = [...new Set(rows.map((r) => r.event_id).filter((x): x is string => Boolean(x)))];
  const eventNames: Record<string, string> = {};
  if (eventIds.length) {
    const { data: ev } = await sb.from('events').select('id, name').in('id', eventIds);
    for (const e of (ev ?? []) as Array<{ id: string; name: string }>) eventNames[e.id] = e.name;
  }

  return rows.map((r) => {
    const person = r.contact_id ? people[r.contact_id] : undefined;
    return {
      id: r.id,
      contactId: r.contact_id,
      name: person?.name ?? 'Unknown contact',
      email: person?.email ?? null,
      eventName: r.event_id ? eventNames[r.event_id] ?? 'Unknown event' : '—',
      industryLabel: SURVEY_INDUSTRY_LABEL[r.q1_industry ?? 'other'] ?? 'Other',
      industryFreetext: r.q1_freetext,
      painLabel: SURVEY_PAIN_LABEL[r.q2_pain ?? 'other'] ?? 'Other',
      painFreetext: r.q2_freetext,
      teamSizeLabel: r.team_size ? SURVEY_TEAM_SIZE_LABEL[r.team_size] ?? r.team_size : '—',
      triedLabel: r.tried_before ? SURVEY_TRIED_LABEL[r.tried_before] ?? r.tried_before : '—',
      ideaFreetext: r.q3_freetext,
      intent: r.q4_intent,
      intentLabel: r.q4_intent ? SURVEY_INTENT_LABEL[r.q4_intent] ?? r.q4_intent : '—',
      createdAt: r.created_at,
    };
  });
}

/**
 * Every survey response (SPEC §1.4) — industry / pain / intent breakdowns for
 * the admin Survey tab's charts, plus the full list newest-first. All-time,
 * capped at `limit`: survey volume is one row per attendee per event, so this
 * is generous headroom for a long while.
 */
export async function getSurveyData(limit = 1000): Promise<SurveyData> {
  if (!isSupabaseConfigured()) return EMPTY_SURVEY;
  const sb = getSupabase();
  const { data, error } = await sb
    .from('survey_responses')
    .select(SURVEY_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data || data.length === 0) return EMPTY_SURVEY;

  const rows = data as RawSurveyRow[];
  const responses = await resolveSurveyResponses(rows);

  const eventCounts: Record<string, number> = {};
  for (const r of responses) eventCounts[r.eventName] = (eventCounts[r.eventName] ?? 0) + 1;
  const byEvent = Object.entries(eventCounts)
    .map(([eventName, count]) => ({ eventName, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total: responses.length,
    industry: tally(rows.map((r) => r.q1_industry), SURVEY_INDUSTRY_LABEL),
    pain: tally(rows.map((r) => r.q2_pain), SURVEY_PAIN_LABEL),
    teamSize: tally(rows.map((r) => r.team_size), SURVEY_TEAM_SIZE_LABEL),
    tried: tally(rows.map((r) => r.tried_before), SURVEY_TRIED_LABEL),
    intent: tally(rows.map((r) => r.q4_intent), SURVEY_INTENT_LABEL),
    byEvent,
    responses,
  };
}

/**
 * ALL survey responses, unpaginated by design — for the CSV export, where a
 * silent row cap (Supabase's default per-request max) would just mean
 * incomplete data leaving the system. Pages past that cap the same way
 * getDripPerformance does.
 */
export async function getAllSurveyResponsesForExport(): Promise<SurveyResponseRow[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const rows: RawSurveyRow[] = [];
  for (let from = 0; from <= 100_000; from += 1000) {
    const { data, error } = await sb
      .from('survey_responses')
      .select(SURVEY_SELECT)
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    rows.push(...(data as RawSurveyRow[]));
    if (data.length < 1000) break;
  }
  if (rows.length === 0) return [];
  return resolveSurveyResponses(rows);
}
