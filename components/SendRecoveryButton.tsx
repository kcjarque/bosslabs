'use client';

/**
 * SendRecoveryButton — one-click "fire a payment-recovery email via
 * Resend" for stuck buyers on /admin/pending-payments.
 *
 * Posts to /api/admin/recover-payment which:
 *   1. Pulls the buyer's still-active Xendit invoice URL
 *   2. Renders the payment_recovery template with their firstName + URL
 *   3. Sends via Resend (with reply-to + List-Unsubscribe headers)
 *   4. Stamps metadata.recoveryEmailSent
 *
 * Shows status inline:
 *   - "Send recovery email" (default)
 *   - "Sending…" (loading)
 *   - "Sent ✓ · <time>" (success — persists across page reloads via meta)
 *   - "✗ <error>" (failure with the actual error from Resend/Xendit)
 *
 * If alreadySentAt is set on mount, starts in "sent" state so the admin
 * sees that a recovery has already been fired — prevents duplicate sends.
 */

import { useState } from 'react';

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function SendRecoveryButton({
  signupId,
  firstName,
  email,
  alreadySentAt,
}: {
  signupId: string;
  firstName: string;
  email: string;
  alreadySentAt?: string;
}) {
  type State = 'idle' | 'sending' | 'sent' | 'error';
  const [state, setState] = useState<State>(alreadySentAt ? 'sent' : 'idle');
  const [sentAt, setSentAt] = useState<string | null>(alreadySentAt ?? null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (state === 'sent') {
      // Already sent in this session — require an explicit reset before resending.
      const ok = window.confirm(
        `Recovery email already sent ${sentAt ? timeSince(sentAt) : ''} to ${email}.\n\nSend another one? (Avoid spamming the buyer.)`,
      );
      if (!ok) return;
    }
    setState('sending');
    setError(null);
    try {
      const res = await fetch('/api/admin/recover-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        id?: string;
        provider?: string;
      };
      if (!res.ok || !data.ok) {
        setState('error');
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      setSentAt(new Date().toISOString());
      setState('sent');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }

  if (state === 'sent' && sentAt) {
    return (
      <button
        type="button"
        onClick={send}
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-200"
        title="Click to resend (will prompt for confirmation)"
      >
        <span aria-hidden>✓</span>
        Recovery email sent · {timeSince(sentAt)}
      </button>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={send}
          className="rounded-full bg-red-100 px-3 py-1 text-[11px] font-medium text-red-800 hover:bg-red-200"
        >
          ✗ Failed — retry
        </button>
        {error && (
          <span className="max-w-[260px] text-right text-[10px] text-red-700">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={state === 'sending'}
      className="rounded-full bg-cyan-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      title={`Send recovery email to ${firstName} (${email}) via Resend`}
    >
      {state === 'sending' ? 'Sending…' : '✉ Send recovery email'}
    </button>
  );
}
