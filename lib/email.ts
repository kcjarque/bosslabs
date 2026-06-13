/**
 * Email sending — backed by Resend (https://resend.com).
 *
 * Free tier: 3,000 emails/mo + 100/day. Cheapest reliable option for the
 * volume we'll see at ₱999 webinar scale. Swap by replacing this file.
 *
 * Every outbound email gets:
 *   - reply_to: a real monitored inbox (settings.resendReplyTo) — bare
 *     "no-reply" senders tank Gmail spam scores
 *   - List-Unsubscribe header: RFC 2369 mailto + RFC 8058 one-click URL
 *   - List-Unsubscribe-Post: List-Unsubscribe=One-Click (RFC 8058)
 *   - {{unsubscribeUrl}} auto-injected into template vars so footers
 *     can render a visible unsubscribe link without callers having to
 *     compute the signed token
 */

import {
  getEmailTemplates,
  getSettings,
  renderTemplate,
  isEmailAddressSuppressed,
  type EmailTemplate,
} from './db';
import { signUnsubscribeToken } from './admin-auth';
import { renderEmailMarkdown } from './email-markdown';
import { validateRecipient } from './email-validation';

export type SendEmailResult =
  | { ok: true; id: string; provider: 'resend' | 'ses' | 'demo' }
  | { ok: false; error: string };

/** Show only the local-part initial + domain ending so logs aren't a PII leak. */
function redactEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '[redacted]';
  return `${local?.[0] ?? '*'}***@${domain}`;
}

/** Public base URL for the site — used to build unsubscribe links. */
function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    'https://bosslabs.vercel.app'
  );
}

/** Auto-inject {{unsubscribeUrl}} + any future required token defaults. */
function withDefaultVars(
  recipientEmail: string,
  vars: Record<string, string | number | undefined>,
): Record<string, string | number | undefined> {
  const token = signUnsubscribeToken(recipientEmail);
  const unsubscribeUrl = `${siteUrl()}/unsubscribe?t=${token}`;
  // Don't overwrite anything a caller has explicitly set.
  return { unsubscribeUrl, ...vars };
}

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
  // Fallback: if html is empty but markdown body exists, render the body
  // through the BOSSLABS email shell on the fly. This lets the SQL seed
  // ship templates with just markdown content — emails still work even
  // before the admin opens the editor and clicks Save.
  let html = template.html;
  if ((!html || !html.trim()) && template.body && template.body.trim()) {
    html = renderEmailMarkdown(template.body);
  }
  return {
    template,
    subject: renderTemplate(template.subject, vars),
    html: renderTemplate(html, vars),
  };
}

/**
 * Send a single email. Either pass `templateId` + `vars`, or pass raw
 * `subject` + `html`. Falls back to a "demo" no-op when Resend key is missing,
 * so the form flows work locally without any setup.
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  // Suppression gate — the address previously hard-bounced or filed a spam
  // complaint. Sending again is pointless (undeliverable) and damages sender
  // reputation, so refuse here regardless of which flow asked.
  if (await isEmailAddressSuppressed(args.to).catch(() => false)) {
    return {
      ok: false,
      error: 'Recipient suppressed — this address previously hard-bounced (or reported spam).',
    };
  }

  // Validity gate — never SEND to an address that physically can't receive mail:
  // bad syntax, a known disposable domain, or a domain with no MX records (a
  // typo'd "@gmial.com"). These would hard-bounce, so skipping them keeps junk
  // off our bounce rate and protects sender reputation. This does NOT touch
  // checkout — it only stops the SEND. We fail OPEN on DNS uncertainty
  // (validateRecipient only returns !ok when DNS is certain), and on any error
  // here we send rather than risk dropping a real recipient.
  const validity = await validateRecipient(args.to).catch(() => ({ ok: true as const }));
  if (!validity.ok) {
    return {
      ok: false,
      error: `Recipient undeliverable (${validity.reason}) — not sent, to protect sender reputation.`,
    };
  }

  const settings = await getSettings();

  let subject = args.subject ?? '';
  let html = args.html ?? '';

  // Build the unsubscribe URL once — needed both for the template var
  // (visible footer link) and for the List-Unsubscribe headers.
  const token = signUnsubscribeToken(args.to);
  const unsubscribeUrl = `${siteUrl()}/api/unsubscribe?t=${token}`;
  const unsubscribePage = `${siteUrl()}/unsubscribe?t=${token}`;

  if (args.templateId) {
    const rendered = await renderEmail(
      args.templateId,
      withDefaultVars(args.to, args.vars ?? {}),
    );
    if (!rendered) {
      return { ok: false, error: `Email template "${args.templateId}" not found` };
    }
    subject = rendered.subject;
    html = rendered.html;
  }

  if (!subject || !html) {
    return { ok: false, error: 'subject and html are required' };
  }

  // ---- Provider: Amazon SES (opt-in via settings.emailProvider = 'ses') ----
  // Same from identity + deliverability headers as the Resend path; the AWS
  // SDK is imported lazily so the Resend path never loads it.
  if (settings.emailProvider === 'ses') {
    const from = `${settings.resendFromName} <${settings.resendFromEmail}>`;
    const replyTo = settings.resendReplyTo || settings.resendFromEmail;
    const { isSesConfigured, sendViaSes } = await import('./ses');
    // Demo no-op when AWS creds aren't set — mirrors the Resend demo path so
    // local/dev flows keep working without secrets.
    if (!isSesConfigured()) {
      console.log('[email/demo-ses]', { to: redactEmail(args.to), subject, htmlLen: html.length });
      return { ok: true, id: `demo_${Date.now()}`, provider: 'demo' };
    }
    const r = await sendViaSes({
      from,
      to: args.to,
      subject,
      html,
      replyTo,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${replyTo}?subject=Unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    return r.ok ? { ok: true, id: r.id, provider: 'ses' } : { ok: false, error: `SES: ${r.error}` };
  }

  // Demo fallback — log redacted info and return ok so the funnel keeps moving.
  // Never put the full recipient email into logs; Vercel logs are searchable.
  if (!settings.resendApiKey) {
    console.log('[email/demo]', {
      to: redactEmail(args.to),
      subject,
      htmlLen: html.length,
    });
    return { ok: true, id: `demo_${Date.now()}`, provider: 'demo' };
  }

  // Default Reply-To: prefer explicit setting, else fall back to the From
  // address so we still set the header (Gmail prefers it set over absent).
  const replyTo = settings.resendReplyTo || settings.resendFromEmail;

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
        reply_to: replyTo,
        subject,
        html,
        // Gmail/Yahoo's bulk-sender rules (effective Feb 2024) score
        // these headers strongly toward Inbox vs Promotions/Spam.
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${replyTo}?subject=Unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        // Resend tags — show up in their dashboard for funnel-level analytics.
        tags: args.templateId
          ? [{ name: 'template', value: args.templateId }]
          : undefined,
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
  // (unsubscribePage is intentionally unused here — it's the human-facing
  // page; the header points at the one-click API target. Kept in scope
  // for template-side use should we ever want to swap them.)
  void unsubscribePage;
}
