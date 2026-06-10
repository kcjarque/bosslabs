/**
 * ONE-OFF: re-send drip/sequence emails that FAILED during the SES wrong-
 * region outage. Targets sequence_sends with email_ok=false (no message id)
 * for the given email templates. On success, flips the row to email_ok=true +
 * stores the new SES message id (so the SES webhook stamps delivered/bounced).
 * Idempotent. BACKFILL_KEY-gated, DRY-RUN by default (dryRun=0 to send).
 *
 * Exclusions (query param `exclude`, comma-separated):
 *   - unsubscribed: always skipped.
 *   - paid:     skip recipients whose signup is now paid/attended (e.g. cart-
 *               recovery nudges to people who already paid).
 *   - reserved: skip recipients who already have a retreat reservation (e.g.
 *               the retreat "last call" to people already registered).
 *
 * Remove this route once the backfills are done.
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
  const templates = (url.searchParams.get('templates') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (templates.length === 0) {
    return NextResponse.json({ error: 'templates required' }, { status: 400 });
  }
  const exclude = new Set(
    (url.searchParams.get('exclude') || '').split(',').map((s) => s.trim()).filter(Boolean),
  );
  const dryRun = url.searchParams.get('dryRun') !== '0';
  const limit = Math.min(500, Number(url.searchParams.get('limit') || '500'));

  const sb = getSupabase();
  const { data: steps } = await sb
    .from('sequence_steps').select('id, email_template_id').in('email_template_id', templates);
  const stepRows = (steps ?? []) as Array<{ id: string; email_template_id: string }>;
  const stepTpl = new Map(stepRows.map((s) => [s.id, s.email_template_id]));
  const stepIds = stepRows.map((s) => s.id);
  if (stepIds.length === 0) {
    return NextResponse.json({ error: 'no steps for templates', templates }, { status: 400 });
  }

  const { data: sends } = await sb
    .from('sequence_sends')
    .select('id, signup_id, sequence_step_id, sent_at')
    .eq('email_ok', false).is('email_message_id', null).in('sequence_step_id', stepIds)
    .order('sent_at', { ascending: true }).limit(limit);
  const sendRows = (sends ?? []) as Array<{ id: string; signup_id: string; sequence_step_id: string }>;

  // Pre-load reserved emails if we need the 'reserved' exclusion.
  let reservedEmails = new Set<string>();
  if (exclude.has('reserved')) {
    const { data: res } = await sb.from('retreat_reservations').select('email');
    reservedEmails = new Set(((res ?? []) as Array<{ email: string }>).map((r) => (r.email || '').toLowerCase()));
  }

  const webinar = await getWebinarInfo();
  const results: Array<{ email: string; tpl: string; ok: boolean; error?: string; skipped?: string }> = [];
  let processed = 0;
  for (const s of sendRows) {
    const tplId = stepTpl.get(s.sequence_step_id) ?? '';
    const signup = await getSignupById(s.signup_id).catch(() => null);
    if (!signup) {
      results.push({ email: '?', tpl: tplId, ok: false, error: 'signup not found' });
      continue;
    }
    const email = signup.email.toLowerCase();
    if (signup.status === 'unsubscribed') { results.push({ email, tpl: tplId, ok: false, skipped: 'unsubscribed' }); continue; }
    if (exclude.has('paid') && (signup.status === 'paid' || signup.status === 'attended')) {
      results.push({ email, tpl: tplId, ok: false, skipped: 'paid' }); continue;
    }
    if (exclude.has('reserved') && reservedEmails.has(email)) {
      results.push({ email, tpl: tplId, ok: false, skipped: 'reserved' }); continue;
    }
    if (dryRun) { results.push({ email, tpl: tplId, ok: true, skipped: 'dry-run' }); processed++; continue; }
    try {
      const vars = await templateVarsForSignup(signup, webinar);
      const r = await sendEmail({ to: signup.email, templateId: tplId, vars });
      if (r.ok && r.id) {
        await sb.from('sequence_sends').update({
          email_ok: true, email_message_id: r.id, email_status: 'sent', email_status_at: new Date().toISOString(),
        }).eq('id', s.id);
      }
      results.push({ email, tpl: tplId, ok: r.ok, error: r.ok ? undefined : (r as { error: string }).error });
    } catch (err) {
      results.push({ email, tpl: tplId, ok: false, error: err instanceof Error ? err.message : 'error' });
    }
  }

  const byTpl: Record<string, number> = {};
  const bySkip: Record<string, number> = {};
  for (const r of results) {
    if (r.skipped && r.skipped !== 'dry-run') bySkip[r.skipped] = (bySkip[r.skipped] ?? 0) + 1;
    else byTpl[r.tpl] = (byTpl[r.tpl] ?? 0) + 1;
  }
  if (dryRun) {
    return NextResponse.json({ dryRun: true, templates, exclude: [...exclude], wouldSend: processed, byTemplate: byTpl, skipped: bySkip });
  }
  const ok = results.filter((r) => r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  return NextResponse.json({ dryRun: false, attempted: results.length, ok, skipped, bySkip, failed: results.length - ok - skipped, failures: results.filter((r) => !r.ok && !r.skipped) });
}
