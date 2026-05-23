/**
 * /api/admin/test-send — fires a single hardcoded test email or SMS
 * through the production send pipeline using the currently-saved
 * settings. Lets the admin verify Resend / OneWaySMS keys actually
 * work before relying on them in the funnel.
 *
 * Test messages clearly identify themselves as test sends + include
 * a timestamp so the recipient (usually the admin themselves) can
 * tell which test attempt the message came from.
 */

import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';

export const runtime = 'nodejs';

// Coarse throttle (same shape as /api/admin/send) so this can't become a spam vector.
const HITS: { ts: number }[] = [];
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 10;

function tooMany(): boolean {
  const now = Date.now();
  while (HITS.length && now - HITS[0].ts > WINDOW_MS) HITS.shift();
  if (HITS.length >= MAX_PER_WINDOW) return true;
  HITS.push({ ts: now });
  return false;
}

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (tooMany()) return NextResponse.json({ error: 'Slow down — 10 tests/min cap' }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as {
    channel?: 'email' | 'sms';
    to?: string;
  };

  const channel = body.channel;
  const to = (body.to ?? '').trim();

  if (!channel || !to) {
    return NextResponse.json({ error: 'channel and to required' }, { status: 400 });
  }

  const stamp = new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    hour12: false,
  });

  if (channel === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }
    const result = await sendEmail({
      to,
      subject: 'BOSSLABS AI · Test email (admin)',
      html: testEmailHtml(stamp),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, provider: result.provider, id: result.id });
  }

  if (channel === 'sms') {
    // OneWaySMS PH normalizes inside lib/sms.ts; just validate it's mostly digits.
    if (!/^[+0-9 ()-]{7,20}$/.test(to)) {
      return NextResponse.json({ error: 'Invalid phone format' }, { status: 400 });
    }
    const result = await sendSms({
      to,
      body: `BOSSLABS AI test SMS — your OneWaySMS integration is wired up. (${stamp})`,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, provider: result.provider, id: result.id });
  }

  return NextResponse.json({ error: 'unknown channel' }, { status: 400 });
}

function testEmailHtml(stamp: string): string {
  return `<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0B0D12">
  <p style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#0093B8;margin:0 0 12px">BOSSLABS AI · Admin test</p>
  <h1 style="font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:32px;line-height:1.1;margin:0 0 16px">Test email &#10003;</h1>
  <p style="font-size:15px;line-height:1.55;margin:0 0 16px">If you&rsquo;re reading this, your <strong>Resend</strong> integration is wired up correctly and your "From" address is allowed to send.</p>
  <p style="font-size:13px;line-height:1.55;color:#454A57;margin:0 0 16px">Sent from <code>/admin/settings</code> at ${stamp} (Asia/Manila).</p>
  <p style="font-size:12px;color:#6B6F7C">&mdash; BOSSLABS AI Admin</p>
</div>`;
}
