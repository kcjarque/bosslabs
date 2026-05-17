'use client';

import { useState } from 'react';
import { PaymentLogos } from './PaymentLogos';

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

      {/* Trust block — lock + secured copy + payment chips */}
      <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.04] p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:items-center">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/[0.10] sm:h-11 sm:w-11">
            <LockIcon size={18} />
          </div>
          <div className="min-w-0">
            <div className="font-serif text-[15px] leading-tight text-white sm:text-[17px]">
              100% Secure Payment
            </div>
            <p className="mt-1 text-[12px] leading-snug text-ink-100 sm:text-[13px]">
              All payments are encrypted end-to-end. We{' '}
              <strong className="font-semibold text-white">never see, touch, or store</strong> your card or payment details.
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-cyan-500/15 pt-4">
          <div className="text-center text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
            Choose your payment method
          </div>
          <PaymentLogos className="mt-3" />
          <p className="mt-3 text-center text-[10px] text-ink-300 sm:text-[11px]">
            Credit Card · GCash · Maya
          </p>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 border-t border-cyan-500/15 pt-3 text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
          <LockIcon size={12} /> Powered by Xendit · PCI-DSS Level 1
        </div>
      </div>
    </form>
  );
}

function LockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-cyan-400">
      <path
        d="M7 10V8a5 5 0 0 1 10 0v2m-12 0h14v10H5V10Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
