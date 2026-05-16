import { NextResponse } from 'next/server';
import { addSignup, getSettings } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { WEBINAR } from '@/lib/config';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      firstName?: string;
      email?: string;
      phone?: string;
    };

    if (!body.firstName || !body.email || !body.phone) {
      return NextResponse.json(
        { error: 'First name, email, and mobile are required' },
        { status: 400 },
      );
    }

    const signup = await addSignup({
      firstName: body.firstName.trim(),
      email: body.email.trim(),
      phone: body.phone.trim(),
      source: 'free',
    });

    // Fire-and-forget welcome email + SMS (template lookup, with var injection).
    const settings = await getSettings();
    const vars = {
      firstName: signup.firstName,
      email: signup.email,
      phone: signup.phone,
      webinarDate: WEBINAR.date,
      webinarTime: WEBINAR.time,
      webinarTimezone: WEBINAR.timezone,
      zoomRegisterUrl: settings.zoomRegisterUrl,
      zoomJoinUrl: settings.zoomJoinUrl,
      replayUrl: settings.replayUrl,
      messengerGroupUrl: settings.messengerGroupUrl,
    };

    Promise.all([
      sendEmail({ to: signup.email, templateId: 'free_welcome', vars }),
      sendSms({ to: signup.phone, templateId: 'free_welcome', vars }),
    ]).catch((err) => console.error('[register] notification error:', err));

    return NextResponse.json({ ok: true, id: signup.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
