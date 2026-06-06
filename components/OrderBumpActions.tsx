'use client';

import { useState } from 'react';
import { OFFER, formatPHP } from '@/lib/config';

type Group = 'GCASH' | 'CREDIT_CARD' | 'BANKS';

type AppliedPromo = {
  code: string;
  discountCentavos: number;
  finalCentavos: number;
  isFree: boolean;
};

const METHODS: { group: Group; label: string; icon: React.ReactNode }[] = [
  { group: 'GCASH', label: 'Pay via GCash', icon: <Dot className="bg-cyan-400" /> },
  { group: 'CREDIT_CARD', label: 'Pay via Credit Card', icon: <Dot className="bg-violet-400" /> },
  { group: 'BANKS', label: 'Pay via Bank with QRPH', icon: <Dot className="bg-amber-400" /> },
];

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${className}`} />;
}

export function OrderBumpActions() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState<Group | 'FREE' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [promoInput, setPromoInput] = useState('');
  const [applied, setApplied] = useState<AppliedPromo | null>(null);
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const priceLabel = applied
    ? applied.isFree
      ? 'FREE'
      : formatPHP(applied.finalCentavos)
    : OFFER.oto.label;

  async function applyPromo() {
    const code = promoInput.trim();
    if (!code) return;
    setPromoApplying(true);
    setPromoError(null);
    try {
      const res = await fetch('/api/checkout/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, base: 'oto' }),
      });
      const data = await res.json();
      if (!res.ok || !data?.valid) {
        setApplied(null);
        setPromoError(
          data?.reason === 'expired'
            ? 'This code has expired.'
            : data?.reason === 'exhausted'
              ? 'This code has been fully claimed.'
              : 'Invalid promo code.',
        );
        return;
      }
      setApplied({
        code: data.code,
        discountCentavos: data.discountCentavos,
        finalCentavos: data.finalCentavos,
        isFree: Boolean(data.isFree),
      });
    } catch (err) {
      setApplied(null);
      setPromoError(err instanceof Error ? err.message : 'Could not check code.');
    } finally {
      setPromoApplying(false);
    }
  }

  function clearPromo() {
    setApplied(null);
    setPromoInput('');
    setPromoError(null);
  }

  async function pay(group?: Group) {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter the email you registered with.');
      return;
    }
    setLoading(group ?? 'FREE');
    try {
      const res = await fetch('/api/order-bump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          paymentMethod: group,
          promoCode: applied?.code,
        }),
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

      {/* Promo code (same codes as the main checkout) */}
      <div className="mt-5">
        <label htmlFor="ob-promo" className="block text-[11px] uppercase tracking-[0.22em] text-cyan-400">
          Promo code <span className="text-ink-300">(optional)</span>
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="ob-promo"
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
            placeholder="Enter code"
            disabled={!!applied || loading !== null}
            className="min-w-0 flex-1 rounded-full border border-white/15 bg-[#06070A]/60 px-5 py-3 text-[14px] uppercase tracking-wide text-white outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-400 focus:border-cyan-400 disabled:opacity-60"
          />
          {applied ? (
            <button
              type="button"
              onClick={clearPromo}
              disabled={loading !== null}
              className="flex-none rounded-full border border-white/15 px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-ink-200 transition hover:text-white"
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              onClick={applyPromo}
              disabled={promoApplying || !promoInput.trim() || loading !== null}
              className="flex-none rounded-full border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
            >
              {promoApplying ? 'Checking…' : 'Apply'}
            </button>
          )}
        </div>
        {applied && (
          <div className="mt-2 text-[12px] text-emerald-300">
            ✓ <span className="font-semibold">{applied.code}</span> applied —{' '}
            {applied.isFree ? 'FREE' : `−${formatPHP(applied.discountCentavos)}`}. You pay{' '}
            <span className="font-semibold text-white">{priceLabel}</span>.
          </div>
        )}
        {promoError && <div className="mt-2 text-[12px] text-rose-300">{promoError}</div>}
      </div>

      <div className="mt-5 space-y-3">
        {applied?.isFree ? (
          <button
            type="button"
            onClick={() => pay(undefined)}
            disabled={loading !== null}
            className="btn-primary w-full !py-4 text-center text-base disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Claiming…' : 'Claim my free upgrade →'}
          </button>
        ) : (
          METHODS.map((m) => (
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
                <span className="flex items-baseline gap-2">
                  {applied && (
                    <span className="font-serif text-[12px] text-ink-400 line-through sm:text-[13px]">
                      {OFFER.oto.label}
                    </span>
                  )}
                  <span className="font-serif text-[15px] tracking-tight text-cyan-300 sm:text-[17px]">
                    {priceLabel}
                  </span>
                </span>
              </span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-none text-cyan-400 transition group-hover:translate-x-0.5" aria-hidden="true">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))
        )}
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
