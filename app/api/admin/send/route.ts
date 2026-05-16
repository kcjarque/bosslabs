import { NextResponse } from 'next/server';
import { isAdminLoggedIn } from '@/lib/admin-auth';
import { getSignups, type Signup } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { getWebinarInfo } from '@/lib/webinar';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as {
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
