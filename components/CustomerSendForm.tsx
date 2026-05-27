'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Template = { id: string; name: string };

/**
 * Send a templated email or SMS to a customer. Posts to the existing
 * /api/admin/send route, then router.refresh() so the comms timeline
 * below picks up the new event.
 */
export function CustomerSendForm({
  signupId,
  hasPhone,
  emailTemplates,
  smsTemplates,
}: {
  signupId: string;
  hasPhone: boolean;
  emailTemplates: Template[];
  smsTemplates: Template[];
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [templateId, setTemplateId] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const templates = channel === 'email' ? emailTemplates : smsTemplates;

  // Clear the picked template when the user switches channels — the
  // available IDs are different per channel so the previous choice may
  // not exist in the new list.
  function switchChannel(c: 'email' | 'sms') {
    setChannel(c);
    setTemplateId('');
  }

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
              onClick={() => switchChannel(c)}
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
        <label className="label">Template</label>
        {templates.length === 0 ? (
          <p className="text-xs text-slate-500">
            No {channel} templates yet. Create one in /admin/templates.
          </p>
        ) : (
          <select
            className="select"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">Pick a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{' '}
                <span className="text-slate-400">— {t.id}</span>
              </option>
            ))}
          </select>
        )}
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
