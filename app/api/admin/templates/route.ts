import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import {
  saveEmailTemplate,
  saveSmsTemplate,
  type EmailTemplate,
  type SmsTemplate,
} from '@/lib/db';
import { renderEmailMarkdown } from '@/lib/email-markdown';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    kind?: 'email' | 'sms';
    template?: EmailTemplate | SmsTemplate;
  };

  if (!body.kind || !body.template?.id || !body.template.name) {
    return NextResponse.json({ error: 'kind, template.id and template.name required' }, { status: 400 });
  }

  if (body.kind === 'email') {
    const t = body.template as EmailTemplate;
    if (!t.subject) {
      return NextResponse.json({ error: 'subject required' }, { status: 400 });
    }
    // When the editor sends markdown body, render it server-side so the
    // html column always matches the markdown source (no client drift).
    // When only html is sent (legacy HTML mode), keep it as the canonical
    // version and leave body null.
    const md = typeof t.body === 'string' ? t.body : null;
    let html = t.html;
    if (md && md.trim()) {
      html = renderEmailMarkdown(md);
    } else if (!t.html) {
      return NextResponse.json({ error: 'body or html required' }, { status: 400 });
    }
    await saveEmailTemplate({
      id: t.id,
      name: t.name,
      subject: t.subject,
      html,
      body: md && md.trim() ? md : null,
    });
  } else {
    const t = body.template as SmsTemplate;
    if (!t.body) {
      return NextResponse.json({ error: 'body required' }, { status: 400 });
    }
    await saveSmsTemplate(t);
  }
  return NextResponse.json({ ok: true });
}
