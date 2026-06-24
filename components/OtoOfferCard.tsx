'use client';

import { useState } from 'react';
import { OFFER, formatPHP } from '@/lib/config';
import { getFbCookies } from '@/lib/meta-client';

type Product = 'oto2' | 'oto';
type AppliedPromo = { code: string; discountCentavos: number; finalCentavos: number; isFree: boolean };

const PRODUCTS: Product[] = ['oto2', 'oto'];

function fmtCentavos(c: number) {
  return `₱${(c / 100).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * The /oto offer card — lets the buyer choose between the ₱3,997 1:1 Build
 * Session (oto2) and the ₱999 AI Secrets Builder Vault (oto), then buy with an
 * optional promo. Works post-purchase (orderId present) and standalone (no
 * order → collects name/email/phone). Posts the chosen product to /api/oto.
 */
export function OtoOfferCard({ orderId }: { orderId: string }) {
  const standalone = !orderId;

  // Multi-select picker: at least one must be checked. Default to the premium
  // (oto2 = 1:1 Build Session). When both are checked, the buyer pays the
  // combined total in a single invoice and the webhook delivers both products.
  const [selected, setSelected] = useState<Set<Product>>(new Set(['oto2']));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [promoInput, setPromoInput] = useState('');
  const [applied, setApplied] = useState<AppliedPromo | null>(null);
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const both = selected.has('oto') && selected.has('oto2');
  // For single picks we keep the existing per-product offer panel; for both
  // the buyer sees stacked details below.
  const single: Product | null = both ? null : selected.has('oto') ? 'oto' : 'oto2';
  const singleOffer = single ? (single === 'oto' ? OFFER.oto : OFFER.oto2) : null;
  const totalCentavos =
    (selected.has('oto') ? OFFER.oto.priceCentavos : 0) +
    (selected.has('oto2') ? OFFER.oto2.priceCentavos : 0);
  const priceLabel = both
    ? fmtCentavos(totalCentavos)
    : applied
      ? applied.isFree
        ? 'FREE'
        : formatPHP(applied.finalCentavos)
      : singleOffer?.label || '';

  function toggle(p: Product) {
    setApplied(null);
    setPromoError(null);
    // Clear the input too — otherwise toggling 'both' on then off leaves a
    // pre-filled code with no applied banner, misleading the buyer that the
    // discount is still active when it isn't.
    setPromoInput('');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) {
        if (next.size === 1) return next; // refuse to un-check the last one
        next.delete(p);
      } else {
        next.add(p);
      }
      return next;
    });
  }

  async function applyPromo() {
    const code = promoInput.trim();
    if (!code) return;
    setPromoApplying(true);
    setPromoError(null);
    try {
      // Promo can only price a single product. The UI hides the promo input
      // when 'both' is selected; this falls back to the premium pick defensively.
      const promoBase: Product = single ?? 'oto2';
      const res = await fetch('/api/checkout/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, base: promoBase }),
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

  async function buy() {
    setError(null);
    if (selected.size === 0) {
      setError('Pick at least one upgrade.');
      return;
    }
    // 'both' when both checked, else the single product id.
    const apiProduct: 'oto' | 'oto2' | 'both' = both ? 'both' : (selected.has('oto') ? 'oto' : 'oto2');
    // Promo only applies to single-product purchases (server also enforces this).
    const promoCode = both ? undefined : applied?.code;
    let payload: Record<string, unknown> = { orderId, product: apiProduct, promoCode };
    if (standalone) {
      if (!name.trim() || !email.includes('@')) {
        setError('Please enter your name and a valid email.');
        return;
      }
      const fb = getFbCookies();
      payload = {
        standalone: true,
        product: apiProduct,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        promoCode,
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
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-5 shadow-glow sm:p-8">
      {/* Product picker — multi-select, tick both to bundle in one invoice */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">Choose your upgrades</div>
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-ink-300">Tick both to bundle</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
        {PRODUCTS.map((p) => {
          const o = p === 'oto' ? OFFER.oto : OFFER.oto2;
          const active = selected.has(p);
          return (
            <button
              key={p}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => toggle(p)}
              className={`rounded-2xl border p-3 text-left transition sm:p-4 ${
                active
                  ? 'border-cyan-400 bg-cyan-500/10 shadow-glow-sm'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/25'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-4 w-4 flex-none items-center justify-center rounded-[5px] border ${
                    active ? 'border-cyan-400 bg-cyan-400/90' : 'border-white/30'
                  }`}
                  aria-hidden
                >
                  {active && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#06070A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="font-serif text-base text-white sm:text-lg">{o.label}</span>
                <span className="font-serif text-[12px] text-ink-300 line-through">{o.totalValue}</span>
              </div>
              <div className="mt-1 font-sans text-[12px] leading-snug text-ink-100 sm:text-[13px]">{o.name}</div>
            </button>
          );
        })}
      </div>
      {both && (
        <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.06] px-3 py-2 text-[12.5px] text-emerald-200">
          ✓ Both selected — one checkout, both delivered. Total{' '}
          <span className="font-semibold text-white">{fmtCentavos(totalCentavos)}</span>.
        </div>
      )}

      {/* Selected offer(s) */}
      <div className="mt-6 border-t border-white/[0.07] pt-6">
        {both ? (
          <div className="space-y-6">
            {(['oto2', 'oto'] as const).map((p) => {
              const o = p === 'oto' ? OFFER.oto : OFFER.oto2;
              return (
                <div key={p}>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">{o.eyebrow}</div>
                  <h3 className="font-serif text-xl text-white sm:text-2xl">{o.name}</h3>
                  <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink-100 sm:text-[14px]">{o.promise}</p>
                  <div className="mt-3 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.015]">
                    {o.valueStack.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="flex items-start gap-2.5 font-sans text-[13px] leading-snug text-ink-100">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-[2px] flex-none text-cyan-400">
                            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span>{row.label}</span>
                        </span>
                        <span className="flex-none font-serif text-[13px] text-ink-300">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="flex items-baseline justify-between gap-3 border-t border-white/[0.08] pt-5">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">Bundle total</div>
                <div className="mt-1 font-serif text-4xl tracking-tight text-white sm:text-5xl">{fmtCentavos(totalCentavos)}</div>
              </div>
              <div className="font-serif text-lg text-ink-300 line-through sm:text-xl">
                {OFFER.oto2.totalValue} + {OFFER.oto.totalValue}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">{singleOffer!.eyebrow}</div>
            <h2 className="h-sub mt-2">{singleOffer!.name}</h2>
            <p className="mt-3 font-sans text-[13px] leading-relaxed text-ink-100 sm:text-[14px]">{singleOffer!.promise}</p>

            <div className="mt-5 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.015]">
              {singleOffer!.valueStack.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="flex items-start gap-2.5 font-sans text-[13px] leading-snug text-ink-100">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-[2px] flex-none text-cyan-400">
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{row.label}</span>
                  </span>
                  <span className="flex-none font-serif text-[13px] text-ink-300">{row.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-baseline gap-3">
              <div className="font-serif text-4xl tracking-tight text-white sm:text-5xl">{priceLabel}</div>
              <div className="font-serif text-lg text-ink-300 line-through sm:text-xl">{singleOffer!.totalValue}</div>
            </div>
          </>
        )}
      </div>

      {/* Standalone buyer details */}
      {standalone && (
        <div className="mt-6 space-y-2">
          <label className="block text-[11px] uppercase tracking-[0.22em] text-cyan-400">Your details</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoComplete="name" disabled={loading} className={inputCls} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" inputMode="email" disabled={loading} className={inputCls} />
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile (e.g. 0917…)" autoComplete="tel" inputMode="tel" disabled={loading} className={inputCls} />
        </div>
      )}

      {/* Promo — single-product only (server refuses it for the bundle) */}
      {!both && (
        <div className="mt-5">
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
              <button type="button" onClick={() => { setApplied(null); setPromoInput(''); setPromoError(null); }} disabled={loading} className="flex-none rounded-full border border-white/15 px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-ink-200 transition hover:text-white">
                Remove
              </button>
            ) : (
              <button type="button" onClick={applyPromo} disabled={promoApplying || !promoInput.trim() || loading} className="flex-none rounded-full border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50">
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
      )}

      <button onClick={buy} disabled={loading} className="btn-primary mt-6 w-full !py-4 !px-8 text-base">
        {loading
          ? 'Taking you to checkout…'
          : applied?.isFree
            ? 'Claim it free →'
            : both
              ? `Get both — ${priceLabel}`
              : `Get it — ${priceLabel}`}
      </button>
      {error && (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>
      )}
    </div>
  );
}

const inputCls =
  'w-full rounded-2xl border border-white/15 bg-[#06070A]/60 px-5 py-3 text-[14px] text-white outline-none transition placeholder:text-ink-400 focus:border-cyan-400 disabled:opacity-60';
