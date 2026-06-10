/**
 * ONE-OFF: re-send drip (sequence) emails that FAILED during the SES wrong-
 * region outage (Jun 6-10). Targets sequence_sends with email_ok=false for the
 * given email templates (default: the still-relevant post-webinar 3 + 4), whose
 * email never got a message id. On success, flips the existing row to
 * email_ok=true + stores the new SES message id so the SES webhook stamps
 * delivered/bounced. Idempotent (skips rows that already have a message id).
 * BACKFILL_KEY-gated, DRY-RUN by default (pass dryRun=0 to send). Skips
 * unsubscribed recipients. Remove this route once the backfill is done.
 */
import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { getSignupById } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { getWebinarInfo, templateVarsForSignup } from '@/lib/webinar';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.BACKFILL_KEY || url.searchParams.get('key') !== process.env.BACKFILL_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const templates = (url.searchParams.get('templates') || 'pw_community,pw_retreat')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const dryRun = url.searchParams.get('dryRun') !== '0';
  const limit = Math.min(500, Number(url.searchParams.get('limit') || '500'));

  const sb = getSupabase();
  // Steps whose EMAIL leg uses one of the target templates.
  const { data: steps } = await sb
    .from('sequence_steps')
    .select('id, email_template_id')
    .in('email_template_id', templates);
  const stepRows = (steps ?? []) as Array<{ id: string; email_template_id: string }>;
  const stepTpl = new Map(stepRows.map((s) => [s.id, s.email_template_id]));
  const stepIds = stepRows.map((s) => s.id);
  if (stepIds.length === 0) {
    return NextResponse.json({ error: 'no steps for templates', templates }, { status: 400 });
  }

  // Failed email sends not yet backfilled (no message id).
  const { data: sends } = await sb
    .from('sequence_sends')
    .select('id, signup_id, sequence_step_id, sent_at')
    .eq('email_ok', false)
    .is('email_message_id', null)
    .in('sequence_step_id', stepIds)
    .order('sent_at', { ascending: true })
    .limit(limit);
  const sendRows = (sends ?? []) as Array<{
    id: string;
    signup_id: string;
    sequence_step_id: string;
    sent_at: string;
  }>;

  if (dryRun) {
    const byTpl: Record<string, number> = {};
    for (const s of sendRows) {
      const t = stepTpl.get(s.sequence_step_id) ?? '?';
      byTpl[t] = (byTpl[t] ?? 0) + 1;
    }
    return NextResponse.json({ dryRun: true, templates, count: sendRows.length, byTemplate: byTpl });
  }

  const webinar = await getWebinarInfo();
  const results: Array<{ email: string; tpl: string; ok: boolean; error?: string; skipped?: string }> = [];
  for (const s of sendRows) {
    const tplId = stepTpl.get(s.sequence_step_id) ?? '';
    try {
      const signup = await getSignupById(s.signup_id);
      if (!signup) {
        results.push({ email: '?', tpl: tplId, ok: false, error: 'signup not found' });
        continue;
      }
      if (signup.status === 'unsubscribed') {
        results.push({ email: signup.email, tpl: tplId, ok: false, skipped: 'unsubscribed' });
        continue;
      }
      const vars = await templateVarsForSignup(signup, webinar);
      const r = await sendEmail({ to: signup.email, templateId: tplId, vars });
      if (r.ok && r.id) {
        await sb
          .from('sequence_sends')
          .update({
            email_ok: true,
            email_message_id: r.id,
            email_status: 'sent',
            email_status_at: new Date().toISOString(),
          })
          .eq('id', s.id);
      }
      results.push({ email: signup.email, tpl: tplId, ok: r.ok, error: r.ok ? undefined : (r as { error: string }).error });
    } catch (err) {
      results.push({ email: '?', tpl: tplId, ok: false, error: err instanceof Error ? err.message : 'error' });
    }
  }
  const ok = results.filter((r) => r.ok).length;
  const skipped = results.filter((r) => r.skipped).length;
  return NextResponse.json({
    dryRun: false,
    attempted: results.length,
    ok,
    skipped,
    failed: results.length - ok - skipped,
    results,
  });
}
