'use client';

import { useState } from 'react';
import { OFFER, formatPHP } from '@/lib/config';

type Group = 'GCASH' | 'CREDIT_CARD' | 'BANKS';
type Product = 'oto2' | 'oto';

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

const offerFor = (p: Product) => (p === 'oto2' ? OFFER.oto2 : OFFER.oto);

export function OrderBumpActions() {
  // Default to the ₱3,997 1:1 — the post-webinar audit emails link here.
  const [selected, setSelected] = useState<Product>('oto2');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState<Group | 'FREE' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [promoInput, setPromoInput] = useState('');
  const [applied, setApplied] = useState<AppliedPromo | null>(null);
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const offer = offerFor(selected);
  const priceLabel = applied
    ? applied.isFree
      ? 'FREE'
      : formatPHP(applied.finalCentavos)
    : offer.label;

  function selectProduct(p: Product) {
    if (p === selected || loading !== null) return;
    setSelected(p);
    // A promo's discount is priced against the product, so switching invalidates it.
    setApplied(null);
    setPromoInput('');
    setPromoError(null);
    setError(null);
  }

  async function applyPromo() {
    const code = promoInput.trim();
    if (!code) return;
    setPromoApplying(true);
    setPromoError(null);
    try {
      const res = await fetch('/api/checkout/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, base: selected }),
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
          product: selected,
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
    <div>
      {/* Product selector */}
      <div className="grid gap-3 sm:grid-cols-2">
        {(['oto2', 'oto'] as Product[]).map((p) => {
          const o = offerFor(p);
          const active = selected === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => selectProduct(p)}
              aria-pressed={active}
              className={`rounded-2xl border p-4 text-left transition ${
                active
                  ? 'border-cyan-400 bg-cyan-500/[0.12] shadow-glow-sm'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-400">{o.eyebrow}</span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    active ? 'border-cyan-400 bg-cyan-400 text-[#06070A]' : 'border-white/25 text-transparent'
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <div className="mt-2 font-serif text-[16px] leading-tight text-white">{o.name}</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-serif text-2xl tracking-tight text-white">{o.label}</span>
                <span className="font-serif text-sm text-ink-300 line-through">{o.crossed}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected product detail */}
      <p className="mt-6 font-sans text-[14px] leading-relaxed text-ink-100 sm:text-[15px]">
        {offer.promise}
      </p>
      <ul className="mt-5 space-y-3">
        {offer.inclusions.map((line) => (
          <li
            key={line}
            className="flex items-start gap-3 font-sans text-[14px] leading-relaxed text-ink-100 sm:text-[15px]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-[2px] flex-none text-cyan-400">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {/* Email + promo + pay */}
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

        {/* Promo code */}
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
                        {offer.label}
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
    </div>
  );
}
