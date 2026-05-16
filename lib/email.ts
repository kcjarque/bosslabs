/**
 * Email sending — backed by Resend (https://resend.com).
 *
 * Free tier: 3,000 emails/mo + 100/day. Cheapest reliable option for the
 * volume we'll see at ₱999 webinar scale. Swap by replacing this file.
 */

import {
  getEmailTemplates,
  getSettings,
  renderTemplate,
  type EmailTemplate,
} from './db';

export type SendEmailResult =
  | { ok: true; id: string; provider: 'resend' | 'demo' }
  | { ok: false; error: string };

export type SendEmailArgs = {
  to: string;
  templateId?: string;
  subject?: string;
  html?: string;
  vars?: Record<string, string | number | undefined>;
};

/** Render a template by id, merging in the variable map. */
export async function renderEmail(
  templateId: string,
  vars: Record<string, string | number | undefined> = {},
): Promise<{ template: EmailTemplate; subject: string; html: string } | null> {
  const templates = await getEmailTemplates();
  const template = templates.find((t) => t.id === templateId);
  if (!template) return null;
  return {
    template,
    subject: renderTemplate(template.subject, vars),
    html: renderTemplate(template.html, vars),
  };
}

/**
 * Send a single email. Either pass `templateId` + `vars`, or pass raw
 * `subject` + `html`. Falls back to a "demo" no-op when Resend key is missing,
 * so the form flows work locally without any setup.
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const settings = await getSettings();

  let subject = args.subject ?? '';
  let html = args.html ?? '';

  if (args.templateId) {
    const rendered = await renderEmail(args.templateId, args.vars);
    if (!rendered) {
      return { ok: false, error: `Email template "${args.templateId}" not found` };
    }
    subject = rendered.subject;
    html = rendered.html;
  }

  if (!subject || !html) {
    return { ok: false, error: 'subject and html are required' };
  }

  // Demo fallback — log the email and return ok so the funnel keeps moving
  if (!settings.resendApiKey) {
    console.log('[email/demo]', { to: args.to, subject, htmlPreview: html.slice(0, 120) });
    return { ok: true, id: `demo_${Date.now()}`, provider: 'demo' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${settings.resendFromName} <${settings.resendFromEmail}>`,
        to: [args.to],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }
    const data = (await res.json()) as { id: string };
    return { ok: true, id: data.id, provider: 'resend' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown email error',
    };
  }
}
