'use client';

import { useState } from 'react';

export function CheckoutForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get('name') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      mobile: String(fd.get('mobile') || '').trim(),
    };

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      window.location.href = data.redirectUrl;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="label" htmlFor="name">Full name</label>
        <input id="name" name="name" type="text" required autoComplete="name" className="input" placeholder="Juan Dela Cruz" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@business.com" />
      </div>
      <div>
        <label className="label" htmlFor="mobile">Mobile (PH)</label>
        <input
          id="mobile"
          name="mobile"
          type="tel"
          required
          inputMode="tel"
          autoComplete="tel"
          className="input"
          placeholder="+63 917 000 0000"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full !py-4 text-base">
        {loading ? 'Securing your seat…' : 'Pay ₱999 · Reserve My Seat'}
      </button>
      <p className="text-center text-[11px] uppercase tracking-[0.22em] text-ink-300">
        Cards · GCash · Maya · GrabPay · Bank Transfer
      </p>
    </form>
  );
}
