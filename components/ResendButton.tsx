'use client';

import { useState } from 'react';
import { resendCommAction } from '@/app/admin/customers/actions';

/**
 * Small "Resend" pill on each comms-history event. Re-fires the same template
 * to the customer. Confirms first — this sends a REAL email/SMS — and records
 * the attempt back into the timeline (so it picks up its own delivery status).
 */
export function ResendButton({
  signupId,
  channel,
  templateId,
}: {
  signupId: string;
  channel: 'email' | 'sms';
  templateId: string;
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  async function onClick() {
    if (state === 'sending' || state === 'done') return;
    if (!confirm(`Resend this ${channel === 'email' ? 'email' : 'SMS'} to the customer now?`)) return;
    setState('sending');
    try {
      const res = await resendCommAction(signupId, channel, templateId);
      if (res.ok) {
        setState('done');
      } else {
        setError(res.error || 'Failed');
        setState('error');
      }
    } catch {
      setError('Network error');
      setState('error');
    }
  }

  const label =
    state === 'sending' ? 'Sending…' : state === 'done' ? 'Resent ✓' : state === 'error' ? 'Failed' : '↻ Resend';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === 'sending' || state === 'done'}
      title={state === 'error' ? error : 'Resend this to the customer'}
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition disabled:cursor-default ${
        state === 'done'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : state === 'error'
            ? 'border-red-300 bg-red-50 text-red-700'
            : 'border-slate-200 text-slate-500 hover:border-cyan-300 hover:text-cyan-700'
      }`}
    >
      {label}
    </button>
  );
}
