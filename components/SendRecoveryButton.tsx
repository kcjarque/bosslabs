'use client';

/**
 * SendRecoveryButton — split control for firing a payment-recovery message
 * to a stuck buyer over email, SMS, or both.
 *
 * Posts to /api/admin/recover-payment with a `channel` param. The route:
 *   1. Pulls the buyer's still-active Xendit invoice URL
 *   2. Sends via Resend (email) and/or OneWaySMS (sms)
 *   3. Stamps per-channel markers in signup metadata so the UI can show
 *      "sent N min ago" + delivery status (delivered / bounced) when a
 *      Resend webhook event has come in for it
 *
 * Each channel has its own state — sending one doesn't reset the other.
 */

import { useState } from 'react';

type Channel = 'email' | 'sms' | 'both';
type EmailStatus = 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained';

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Map a Resend webhook status to a compact label + tailwind palette. */
function emailStatusBadge(status: EmailStatus): { label: string; cls: string } {
  switch (status) {
    case 'delivered':
      return { label: 'Delivered', cls: 'bg-emerald-100 text-emerald-800' };
    case 'opened':
      return { label: 'Opened', cls: 'bg-emerald-100 text-emerald-800' };
    case 'clicked':
      return { label: 'Clicked', cls: 'bg-emerald-100 text-emerald-800' };
    case 'bounced':
      return { label: 'Bounced', cls: 'bg-red-100 text-red-800' };
    case 'complained':
      return { label: 'Spam ✗', cls: 'bg-red-100 text-red-800' };
    case 'sent':
    default:
      return { label: 'Accepted (no delivery event yet)', cls: 'bg-amber-100 text-amber-800' };
  }
}

export function SendRecoveryButton({
  signupId,
  firstName,
  email,
  phone,
  alreadySentAt,
  smsSentAt,
  emailStatus,
}: {
  signupId: string;
  firstName: string;
  email: string;
  phone?: string;
  alreadySentAt?: string;
  smsSentAt?: string;
  emailStatus?: EmailStatus;
}) {
  const [emailSentAt, setEmailSentAt] = useState<string | null>(alreadySentAt ?? null);
  const [smsAt, setSmsAt] = useState<string | null>(smsSentAt ?? null);
  const [pending, setPending] = useState<Channel | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Local copy of the email delivery status — gets bumped to 'sent' the
  // moment we fire so the admin sees movement; Resend webhook later
  // upgrades to delivered/bounced via a page reload.
  const [status, setStatus] = useState<EmailStatus | null>(emailStatus ?? null);

  async function send(channel: Channel) {
    if (channel === 'sms' && !phone) {
      setError('No phone on file for this buyer.');
      return;
    }
    // Confirm before firing a second time on a channel we've already used.
    const dupe =
      (channel === 'email' && emailSentAt) ||
      (channel === 'sms' && smsAt) ||
      (channel === 'both' && emailSentAt && smsAt);
    if (dupe) {
      const ok = window.confirm(
        `Already sent recovery ${channel === 'both' ? 'on both channels' : `by ${channel}`} to ${firstName}. Send again?`,
      );
      if (!ok) return;
    }
    setPending(channel);
    setError(null);
    try {
      const res = await fetch('/api/admin/recover-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupId, channel }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        email?: { ok: boolean; error?: string };
        sms?: { ok: boolean; error?: string };
      };
      if (!res.ok || !data.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      const nowIso = new Date().toISOString();
      if (data.email?.ok) {
        setEmailSentAt(nowIso);
        setStatus('sent');
      }
      if (data.sms?.ok) {
        setSmsAt(nowIso);
      }
      // Surface a per-leg failure even when the other leg succeeded.
      const partial = [
        data.email && !data.email.ok ? `email: ${data.email.error}` : null,
        data.sms && !data.sms.ok ? `sms: ${data.sms.error}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      if (partial) setError(partial);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setPending(null);
    }
  }

  const emailBadge = status ? emailStatusBadge(status) : null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      {/* Action row — three pill buttons, disabled while one is in flight. */}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => send('email')}
          disabled={pending !== null}
          className="rounded-full bg-cyan-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          title={`Send recovery email to ${firstName} (${email}) via Resend`}
        >
          {pending === 'email' ? 'Sending…' : '✉ Email'}
        </button>
        <button
          type="button"
          onClick={() => send('sms')}
          disabled={pending !== null || !phone}
          className="rounded-full bg-cyan-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          title={
            phone
              ? `Send recovery SMS to ${firstName} (${phone}) via OneWaySMS`
              : 'No phone on file'
          }
        >
          {pending === 'sms' ? 'Sending…' : '📱 SMS'}
        </button>
        <button
          type="button"
          onClick={() => send('both')}
          disabled={pending !== null || !phone}
          className="rounded-full bg-slate-700 px-3 py-1 text-[11px] font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          title={phone ? 'Send both email and SMS at once' : 'No phone on file'}
        >
          {pending === 'both' ? 'Sending…' : 'Both'}
        </button>
      </div>

      {/* Status badges — one per channel. Show even before sending if a prior
          send has already stamped metadata, so the admin always knows whether
          a recovery has been fired and whether it actually landed. */}
      {(emailSentAt || smsAt) && (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {emailSentAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-200">
              ✉ {timeSince(emailSentAt)}
              {emailBadge && (
                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[9px] ${emailBadge.cls}`}>
                  {emailBadge.label}
                </span>
              )}
            </span>
          )}
          {smsAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-200">
              📱 {timeSince(smsAt)}
            </span>
          )}
        </div>
      )}

      {error && (
        <span className="max-w-[280px] text-right text-[10px] leading-snug text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
