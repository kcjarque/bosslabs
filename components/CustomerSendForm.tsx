'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Send a templated email or SMS to a customer. Posts to the existing
 * /api/admin/send route, then router.refresh() so the comms timeline
 * below picks up the new event.
 */
export function CustomerSendForm({
  signupId,
  hasPhone,
}: {
  signupId: string;
  hasPhone: boolean;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [templateId, setTemplateId] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setStatus('sending');
    setError(null);
    try {
      const res = await fetch('/api/admin/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, templateId, signupId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');
      setStatus('sent');
      setTemplateId('');
      setTimeout(() => {
        setStatus('idle');
        router.refresh();
      }, 1200);
    } catch (err: unknown) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Send failed');
    }
  }

  const disabled = status === 'sending' || !templateId || (channel === 'sms' && !hasPhone);

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Channel</label>
        <div className="flex gap-1">
          {(['email', 'sms'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={`flex-1 rounded-md px-3 py-2 text-sm capitalize transition ${
                channel === c ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {c}
              {c === 'sms' && !hasPhone && (
                <span className="ml-1 text-[10px] opacity-60">(no phone)</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Template ID</label>
        <input
          className="input"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          placeholder={channel === 'email' ? 'paid_confirmation' : 'reminder_24h'}
        />
        <p className="mt-1 text-xs text-slate-500">
          Available IDs are listed in /admin/templates ({channel} tab).
        </p>
      </div>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={send}
        className="btn btn-primary"
      >
        {status === 'sending'
          ? 'Sending…'
          : status === 'sent'
            ? 'Sent ✓'
            : `Send ${channel} now`}
      </button>
    </div>
  );
}
