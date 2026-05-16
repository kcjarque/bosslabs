'use client';

import { useState } from 'react';

const BUSINESS_TYPES = [
  'Agency / Service business',
  'E-commerce / DTC',
  'SaaS / B2B software',
  'Coaching / Course / Info-product',
  'Pre-revenue / Building',
  'Other',
];

export function OnboardingForm({ orderId }: { orderId: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    setError(null);

    const fd = new FormData(e.currentTarget);
    const payload = {
      orderId,
      name: String(fd.get('name') || '').trim(),
      mobile: String(fd.get('mobile') || '').trim(),
      businessType: String(fd.get('businessType') || ''),
      challenge: String(fd.get('challenge') || '').trim(),
    };

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submit failed');
      setStatus('done');
    } catch (err: unknown) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/[0.06] p-6 shadow-glow-sm">
        <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">
          Got it
        </div>
        <p className="mt-2 text-sm text-ink-100">
          Thanks — we'll use your answers to tailor the live build segment of the call.
          See you on Zoom.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" name="name" type="text" required className="input" placeholder="Juan Dela Cruz" />
        </div>
        <div>
          <label className="label" htmlFor="mobile">Mobile (PH)</label>
          <input
            id="mobile"
            name="mobile"
            type="tel"
            required
            inputMode="tel"
            className="input"
            placeholder="+63 917 000 0000"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="businessType">What kind of business are you running?</label>
        <select id="businessType" name="businessType" required className="input">
          <option value="">Select one…</option>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t} className="bg-black">
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="challenge">
          What's the #1 thing eating your week right now?
        </label>
        <textarea
          id="challenge"
          name="challenge"
          required
          rows={4}
          className="input resize-none"
          placeholder="e.g. Replying to leads in DMs is killing my mornings. I'd love to automate the first response and qualification."
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <button type="submit" disabled={status === 'loading'} className="btn-primary w-full !py-4 text-base">
        {status === 'loading' ? 'Saving…' : 'Send & finish setup'}
      </button>
    </form>
  );
}
