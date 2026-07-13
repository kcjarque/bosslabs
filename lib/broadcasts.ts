/**
 * Scheduled broadcasts (SPEC §12.3) — ad-hoc "fresh" emails Kyle writes 2-3×/week,
 * sent to a list at a chosen time by the /api/cron/broadcasts cron. The body is
 * markdown and renders through the same pipeline as templates (offer vars,
 * tracked {{link:*}}, {{screenshot:*}}), so broadcast links tag interest too.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export type BroadcastStatus = 'scheduled' | 'sending' | 'sent' | 'canceled' | 'failed';

export type ScheduledBroadcast = {
  id: string;
  subject: string;
  body: string;
  channel: 'email' | 'sms';
  listId: string | null;
  scheduledAt: string;
  status: BroadcastStatus;
  sentCount: number;
  totalCount: number | null;
  createdAt: string;
  sentAt: string | null;
};

type Row = {
  id: string;
  subject: string;
  body: string;
  channel: string;
  list_id: string | null;
  scheduled_at: string;
  status: string;
  sent_count: number;
  total_count: number | null;
  created_at: string;
  sent_at: string | null;
};

function rowTo(r: Row): ScheduledBroadcast {
  return {
    id: r.id,
    subject: r.subject,
    body: r.body,
    channel: r.channel === 'sms' ? 'sms' : 'email',
    listId: r.list_id,
    scheduledAt: r.scheduled_at,
    status: (['scheduled', 'sending', 'sent', 'canceled', 'failed'].includes(r.status)
      ? r.status
      : 'scheduled') as BroadcastStatus,
    sentCount: r.sent_count ?? 0,
    totalCount: r.total_count,
    createdAt: r.created_at,
    sentAt: r.sent_at,
  };
}

export async function listScheduledBroadcasts(): Promise<ScheduledBroadcast[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await getSupabase()
    .from('scheduled_broadcasts')
    .select('*')
    .order('scheduled_at', { ascending: false })
    .limit(50);
  return ((data ?? []) as Row[]).map(rowTo);
}

export async function createScheduledBroadcast(input: {
  subject: string;
  body: string;
  listId: string;
  scheduledAt: string;
  createdBy?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'Supabase not configured' };
  const { error } = await getSupabase().from('scheduled_broadcasts').insert({
    subject: input.subject,
    body: input.body,
    channel: 'email',
    list_id: input.listId,
    scheduled_at: input.scheduledAt,
    created_by: input.createdBy ?? null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Cancel a broadcast that hasn't started sending yet. */
export async function cancelScheduledBroadcast(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase()
    .from('scheduled_broadcasts')
    .update({ status: 'canceled' })
    .eq('id', id)
    .eq('status', 'scheduled');
}
