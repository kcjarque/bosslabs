import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { getSettings } from '@/lib/db';
import { sendViaSes, isSesConfigured } from '@/lib/ses';

export const runtime = 'nodejs';

/** Fire a one-off email via Amazon SES (regardless of the provider toggle) so
 *  the admin can confirm SES works in this environment + check inbox vs spam. */
export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!isSesConfigured()) {
    return NextResponse.json(
      { error: 'AWS credentials are not set in this environment (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).' },
      { status: 400 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const to = (body.to || '').trim();
  if (!to || !to.includes('@')) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const s = await getSettings();
  const r = await sendViaSes({
    from: `${s.resendFromName} <${s.resendFromEmail}>`,
    to,
    subject: 'BOSSLABS — Amazon SES test ✅',
    html:
      '<p>This is a test email sent through <b>Amazon SES</b>.</p>' +
      '<p>If it landed in your <b>inbox</b> (not spam), DKIM/SPF are working.</p>',
    replyTo: s.resendReplyTo || s.resendFromEmail,
  });
  return r.ok
    ? NextResponse.json({ ok: true, id: r.id })
    : NextResponse.json({ error: r.error }, { status: 502 });
}
