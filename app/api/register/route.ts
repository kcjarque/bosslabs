import { NextResponse } from 'next/server';
import { addSignup } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { getWebinarInfo, freeWelcomeTemplateId } from '@/lib/webinar';

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
    const webinar = await getWebinarInfo();
    const siteBase =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://www.bosslabs.live';
    const vars = {
      firstName: signup.firstName,
      email: signup.email,
      phone: signup.phone,
      webinarName: webinar.name,
      webinarDate: webinar.date,
      webinarTime: webinar.time,
      webinarTimezone: webinar.timezone,
      zoomRegisterUrl: webinar.zoomRegisterUrl,
      zoomJoinUrl: webinar.zoomJoinUrl,
      replayUrl: webinar.replayUrl,
      replayPageUrl: `${siteBase}/replay`,
      messengerGroupUrl: webinar.messengerGroupUrl,
    };

    // If they register after the webinar is over, send the replay welcome
    // instead of "see you on <date> · join the Zoom call".
    const welcomeTpl = await freeWelcomeTemplateId(signup, webinar);
    Promise.all([
      sendEmail({ to: signup.email, templateId: welcomeTpl, vars }),
      sendSms({ to: signup.phone, templateId: welcomeTpl, vars }),
    ]).catch((err) => console.error('[register] notification error:', err));

    return NextResponse.json({ ok: true, id: signup.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
