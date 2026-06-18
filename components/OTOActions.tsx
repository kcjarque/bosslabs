'use client';

import { useState } from 'react';
import { OFFER, formatPHP } from '@/lib/config';
import { getFbCookies } from '@/lib/meta-client';

type AppliedPromo = {
  code: string;
  discountCentavos: number;
  finalCentavos: number;
  isFree: boolean;
};

export function OTOActions({ orderId }: { orderId: string }) {
  // No parent order → this is a standalone 1:1 purchase from a shared link;
  // we collect the buyer's own details. With an order it's the post-purchase
  // upsell and the buyer is already known (no fields shown).
  const standalone = !orderId;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [promoInput, setPromoInput] = useState('');
  const [applied, setApplied] = useState<AppliedPromo | null>(null);
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const priceLabel = applied
    ? applied.isFree
      ? 'FREE'
      : formatPHP(applied.finalCentavos)
    : OFFER.oto2.label;

  async function applyPromo() {
    const code = promoInput.trim();
    if (!code) return;
    setPromoApplying(true);
    setPromoError(null);
    try {
      const res = await fetch('/api/checkout/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, base: 'oto2' }),
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

  async function addBundle() {
    setError(null);

    // Standalone buyers must give us their details (post-purchase already has them).
    let payload: Record<string, unknown> = { orderId, promoCode: applied?.code };
    if (standalone) {
      if (!name.trim() || !email.includes('@')) {
        setError('Please enter your name and a valid email.');
        return;
      }
      const fb = getFbCookies();
      payload = {
        standalone: true,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        promoCode: applied?.code,
        meta: {
          fbp: fb.fbp,
          fbc: fb.fbc,
          sourceUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        },
      };
    }

    setLoading(true);
    try {
      const res = await fetch('/api/oto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upgrade failed');
      window.location.href = data.redirectUrl;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      {/* Buyer details — standalone purchase only (no parent order) */}
      {standalone && (
        <div className="mb-4 space-y-2">
          <label className="block text-[11px] uppercase tracking-[0.22em] text-cyan-400">
            Your details
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            autoComplete="name"
            disabled={loading}
            className="w-full rounded-2xl border border-white/15 bg-[#06070A]/60 px-5 py-3 text-[14px] text-white outline-none transition placeholder:text-ink-400 focus:border-cyan-400 disabled:opacity-60"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            inputMode="email"
            disabled={loading}
            className="w-full rounded-2xl border border-white/15 bg-[#06070A]/60 px-5 py-3 text-[14px] text-white outline-none transition placeholder:text-ink-400 focus:border-cyan-400 disabled:opacity-60"
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Mobile (e.g. 0917…)"
            autoComplete="tel"
            inputMode="tel"
            disabled={loading}
            className="w-full rounded-2xl border border-white/15 bg-[#06070A]/60 px-5 py-3 text-[14px] text-white outline-none transition placeholder:text-ink-400 focus:border-cyan-400 disabled:opacity-60"
          />
        </div>
      )}

      {/* Promo code */}
      <div className="mb-4">
        <label htmlFor="oto-promo" className="block text-[11px] uppercase tracking-[0.22em] text-cyan-400">
          Promo code <span className="text-ink-300">(optional)</span>
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="oto-promo"
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
            placeholder="Enter code"
            disabled={!!applied || loading}
            className="min-w-0 flex-1 rounded-full border border-white/15 bg-[#06070A]/60 px-5 py-3 text-[14px] uppercase tracking-wide text-white outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-400 focus:border-cyan-400 disabled:opacity-60"
          />
          {applied ? (
            <button
              type="button"
              onClick={clearPromo}
              disabled={loading}
              className="flex-none rounded-full border border-white/15 px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-ink-200 transition hover:text-white"
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              onClick={applyPromo}
              disabled={promoApplying || !promoInput.trim() || loading}
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

      <button
        onClick={addBundle}
        disabled={loading}
        className="btn-primary w-full !py-4 !px-8 text-base"
      >
        {loading
          ? standalone
            ? 'Taking you to checkout…'
            : 'Adding to my order…'
          : applied?.isFree
            ? 'Claim my free session →'
            : standalone
              ? `Get my 1:1 Build Session (${priceLabel})`
              : `Yes — Add it to my order (${priceLabel})`}
      </button>
      {error && (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
