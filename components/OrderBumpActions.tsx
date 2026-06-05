'use client';

import { useState } from 'react';
import { OFFER } from '@/lib/config';

type Group = 'GCASH' | 'CREDIT_CARD' | 'BANKS';

const METHODS: { group: Group; label: string; icon: React.ReactNode }[] = [
  { group: 'GCASH', label: 'Pay via GCash', icon: <Dot className="bg-cyan-400" /> },
  { group: 'CREDIT_CARD', label: 'Pay via Credit Card', icon: <Dot className="bg-violet-400" /> },
  { group: 'BANKS', label: 'Pay via Bank with QRPH', icon: <Dot className="bg-amber-400" /> },
];

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${className}`} />;
}

export function OrderBumpActions({ priceLabel }: { priceLabel: string }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay(group: Group) {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter the email you registered with.');
      return;
    }
    setLoading(group);
    try {
      const res = await fetch('/api/order-bump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), paymentMethod: group }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start checkout.');
      window.location.href = data.redirectUrl;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoading(null);
    }
  }

  return (
    <div className="mt-8 border-t border-white/[0.07] pt-7">
      <label htmlFor="ob-email" className="block text-[11px] uppercase tracking-[0.22em] text-cyan-400">
        Your registered email
      </label>
      <input
        id="ob-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        disabled={loading !== null}
        className="mt-2 w-full rounded-full border border-cyan-500/30 bg-[#06070A]/60 px-5 py-3.5 text-[15px] text-white outline-none transition placeholder:text-ink-400 focus:border-cyan-400 disabled:opacity-60"
      />
      <p className="mt-2 text-[11px] text-ink-300">
        Use the same email you used to buy your {OFFER.main.label} webinar ticket.
      </p>

      <div className="mt-5 space-y-3">
        {METHODS.map((m) => (
          <button
            key={m.group}
            type="button"
            onClick={() => pay(m.group)}
            disabled={loading !== null}
            aria-label={`${m.label} — ${priceLabel}`}
            className="group relative flex w-full items-center gap-3 rounded-full border border-cyan-500/40 bg-gradient-to-r from-cyan-500/[0.12] via-cyan-500/[0.06] to-transparent px-5 py-4 text-left transition hover:border-cyan-400 hover:from-cyan-500/[0.18] disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
          >
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-cyan-500/30 bg-[#06070A]/60 sm:h-10 sm:w-10">
              {m.icon}
            </span>
            <span className="flex flex-1 items-center justify-between gap-3">
              <span className="font-serif text-[15px] leading-tight text-white sm:text-[17px]">
                {loading === m.group ? 'Starting secure checkout…' : m.label}
              </span>
              <span className="font-serif text-[15px] tracking-tight text-cyan-300 sm:text-[17px]">
                {priceLabel}
              </span>
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-none text-cyan-400 transition group-hover:translate-x-0.5" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <p className="mt-5 text-center text-[11px] uppercase tracking-[0.22em] text-ink-300">
        {priceLabel} · one-time · 100% secure checkout
      </p>
    </div>
  );
}
