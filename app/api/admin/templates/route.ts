import { NextResponse } from 'next/server';
import { isAdminLoggedIn } from '@/lib/admin-auth';
import {
  saveEmailTemplate,
  saveSmsTemplate,
  type EmailTemplate,
  type SmsTemplate,
} from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as {
    kind?: 'email' | 'sms';
    template?: EmailTemplate | SmsTemplate;
  };

  if (!body.kind || !body.template?.id || !body.template.name) {
    return NextResponse.json({ error: 'kind, template.id and template.name required' }, { status: 400 });
  }

  if (body.kind === 'email') {
    const t = body.template as EmailTemplate;
    if (!t.subject || !t.html) {
      return NextResponse.json({ error: 'subject + html required' }, { status: 400 });
    }
    await saveEmailTemplate(t);
  } else {
    const t = body.template as SmsTemplate;
    if (!t.body) {
      return NextResponse.json({ error: 'body required' }, { status: 400 });
    }
    await saveSmsTemplate(t);
  }
  return NextResponse.json({ ok: true });
}
