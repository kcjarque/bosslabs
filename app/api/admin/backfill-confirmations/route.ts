/**
 * ONE-OFF maintenance: re-send the paid_confirmation email to customers whose
 * confirmation never actually sent because SES was misconfigured (wrong region
 * → MessageRejected) between the SES switch (2026-06-02) and the region fix.
 *
 * Targets paid signups since `since` that have a confirmationSent marker but NO
 * confirmationMessageId (i.e. the email send never returned a real id → it
 * failed). Idempotent: a successful re-send stores the message id, so a re-run
 * skips it. Gated by CRON_SECRET. Defaults to DRY-RUN — pass dryRun=0 to send.
 *
 * Remove this route once the backfill is done.
 */
import { NextResponse } from 'next/server';
import { getSignups, updateSignup } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { getWebinarInfo, templateVarsForSignup } from '@/lib/webinar';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.BACKFILL_KEY || url.searchParams.get('key') !== process.env.BACKFILL_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sinceIso = url.searchParams.get('since') || '2026-06-02T00:00:00+08:00';
  const since = new Date(sinceIso).getTime();
  const dryRun = url.searchParams.get('dryRun') !== '0'; // default: dry-run
  const limit = Math.min(500, Number(url.searchParams.get('limit') || '500'));

  const signups = await getSignups();
  const targets = signups
    .filter((s) => {
      if (s.status !== 'paid' && s.status !== 'attended') return false;
      const m = (s.metadata ?? {}) as Record<string, unknown>;
      const sent = m.confirmationSent as string | undefined;
      if (!sent) return false;
      if (new Date(sent).getTime() < since) return false;
      // Email never succeeded if there's no stored SES message id.
      if (m.confirmationMessageId) return false;
      return true;
    })
    .slice(0, limit);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      since: sinceIso,
      count: targets.length,
      customers: targets.map((s) => ({
        name: `${s.firstName} ${s.lastName ?? ''}`.trim(),
        email: s.email,
        paidAt: (s.metadata as Record<string, unknown>).confirmationSent,
      })),
    });
  }

  const webinar = await getWebinarInfo();
  const results: Array<{ email: string; ok: boolean; error?: string }> = [];
  for (const s of targets) {
    try {
      const vars = await templateVarsForSignup(s, webinar);
      const r = await sendEmail({ to: s.email, templateId: 'paid_confirmation', vars });
      if (r.ok && r.id) {
        await updateSignup(s.id, {
          metadata: {
            ...(s.metadata ?? {}),
            confirmationMessageId: r.id,
            confirmationStatus: 'sent',
            confirmationBackfilledAt: new Date().toISOString(),
          },
        }).catch(() => {});
      }
      results.push({ email: s.email, ok: r.ok, error: r.ok ? undefined : (r as { error: string }).error });
    } catch (err) {
      results.push({ email: s.email, ok: false, error: err instanceof Error ? err.message : 'error' });
    }
  }
  const ok = results.filter((r) => r.ok).length;
  return NextResponse.json({ dryRun: false, since: sinceIso, attempted: results.length, ok, failed: results.length - ok, results });
}
