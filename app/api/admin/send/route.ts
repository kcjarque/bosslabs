import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { getSignups, type Signup } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { getWebinarInfo } from '@/lib/webinar';

export const runtime = 'nodejs';

// Coarse per-admin-instance throttle so a compromised admin session can't
// turn this route into a spam cannon. Resets per lambda warm window.
const SEND_LOG: { ts: number }[] = [];
const SEND_WINDOW_MS = 60 * 1000;
const SEND_MAX = 30; // 30 sends per minute per lambda

function tooMany(): boolean {
  const now = Date.now();
  while (SEND_LOG.length && now - SEND_LOG[0].ts > SEND_WINDOW_MS) SEND_LOG.shift();
  if (SEND_LOG.length >= SEND_MAX) return true;
  SEND_LOG.push({ ts: now });
  return false;
}

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (tooMany()) return NextResponse.json({ error: 'Slow down — 30/min cap' }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as {
    channel?: 'email' | 'sms';
    templateId?: string;
    signupId?: string;
    /* Or send by passing email/phone directly (for test sends from templates pages) */
    to?: string;
    firstName?: string;
  };

  if (!body.channel || !body.templateId) {
    return NextResponse.json({ error: 'channel and templateId required' }, { status: 400 });
  }

  let signup: Signup | undefined;
  if (body.signupId) {
    const all = await getSignups();
    signup = all.find((s) => s.id === body.signupId);
    if (!signup) return NextResponse.json({ error: 'Signup not found' }, { status: 404 });
  }

  const webinar = await getWebinarInfo();
  const vars: Record<string, string> = {
    firstName: signup?.firstName || body.firstName || 'there',
    lastName: signup?.lastName || '',
    email: signup?.email || body.to || '',
    phone: signup?.phone || body.to || '',
    webinarName: webinar.name,
    webinarDate: webinar.date,
    webinarTime: webinar.time,
    webinarTimezone: webinar.timezone,
    zoomRegisterUrl: webinar.zoomRegisterUrl,
    zoomJoinUrl: webinar.zoomJoinUrl,
    replayUrl: webinar.replayUrl,
    messengerGroupUrl: webinar.messengerGroupUrl,
  };

  if (body.channel === 'email') {
    const to = signup?.email || body.to;
    if (!to) return NextResponse.json({ error: 'Recipient email missing' }, { status: 400 });
    const result = await sendEmail({ to, templateId: body.templateId, vars });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ ok: true, provider: result.provider, id: result.id });
  } else {
    const to = signup?.phone || body.to;
    if (!to) return NextResponse.json({ error: 'Recipient phone missing' }, { status: 400 });
    const result = await sendSms({ to, templateId: body.templateId, vars });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ ok: true, provider: result.provider, id: result.id });
  }
}
