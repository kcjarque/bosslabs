'use client';

import { useEffect, useRef, useState } from 'react';
import { OFFER, WINS, formatPHP } from '@/lib/config';
import { getFbCookies, newEventId, trackPixelEvent } from '@/lib/meta-client';
import { PaymentLogos } from './PaymentLogos';

type PayMethod = 'GCASH' | 'CREDIT_CARD' | 'BANKS';

type AppliedPromo = {
  code: string;
  discountType: 'free' | 'percent' | 'fixed';
  discountValue: number;
  discountCentavos: number;
  finalCentavos: number;
  isFree: boolean;
};

export function CheckoutFlow() {
  // `loading` is the method currently in flight — lets us spinner just that
  // button while the other two stay disabled (prevents double-submits).
  const [loading, setLoading] = useState<PayMethod | 'FREE' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bump, setBump] = useState(false);

  // Promo state — the input value, the applied promo (when validation OK),
  // and the in-flight + error state for the Apply button. The applied
  // promo is what drives the discount line in the order summary and
  // whether we swap Pay buttons for "Claim free seat".
  const [promoInput, setPromoInput] = useState('');
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);

  const baseTotal = OFFER.main.priceCentavos + (bump ? OFFER.oto.priceCentavos : 0);
  const total = appliedPromo ? appliedPromo.finalCentavos : baseTotal;
  const isFree = Boolean(appliedPromo?.isFree);

  // Wrap the bump setter so ticking the OTO checkbox fires Meta's
  // AddToCart standard event. Only fires when the box gets CHECKED
  // (not when un-checked — no AddToCart un-fire event exists). Also
  // re-validates any applied promo because the discount math depends on
  // the new total (e.g. a 20% code on the bumped order is bigger).
  const handleBumpChange = (next: boolean) => {
    setBump(next);
    if (next) {
      trackPixelEvent('AddToCart', {
        value: OFFER.oto.priceCentavos / 100,
        currency: 'PHP',
        content_name: OFFER.oto.name,
        content_ids: [OFFER.oto.sku],
        content_type: 'product',
      });
    }
    if (appliedPromo) {
      void reapplyPromo(appliedPromo.code, next);
    }
  };

  async function reapplyPromo(code: string, bumpedNow: boolean) {
    try {
      const res = await fetch('/api/checkout/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, bump: bumpedNow }),
      });
      const data = await res.json();
      if (data?.valid) setAppliedPromo(data as AppliedPromo);
    } catch {
      // Soft fail — keep the previously-applied promo. Server will revalidate
      // on the actual checkout submission.
    }
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
        body: JSON.stringify({ code, bump }),
      });
      const data = await res.json();
      if (!res.ok || !data?.valid) {
        setAppliedPromo(null);
        setPromoError(
          data?.reason === 'expired'
            ? 'This code has expired.'
            : data?.reason === 'exhausted'
              ? 'This code has been fully claimed.'
              : 'Invalid promo code.',
        );
        return;
      }
      setAppliedPromo(data as AppliedPromo);
    } catch (err) {
      setAppliedPromo(null);
      setPromoError(err instanceof Error ? err.message : 'Could not check code.');
    } finally {
      setPromoApplying(false);
    }
  }

  function clearPromo() {
    setAppliedPromo(null);
    setPromoInput('');
    setPromoError(null);
  }

  // Fire ViewContent on mount so Meta builds the "viewed checkout but didn't
  // buy" retargeting audience even if the buyer never clicks Pay. useRef guard
  // stops React strict-mode + tab switches from double-firing.
  const viewContentFired = useRef(false);
  useEffect(() => {
    if (viewContentFired.current) return;
    viewContentFired.current = true;
    trackPixelEvent('ViewContent', {
      value: OFFER.main.priceCentavos / 100,
      currency: 'PHP',
      content_name: OFFER.main.name,
      content_ids: [OFFER.main.sku],
      content_type: 'product',
    });
  }, []);

  async function payWith(method: PayMethod, formEl: HTMLFormElement) {
    // Trigger native HTML5 validation on name/email/mobile before posting.
    if (!formEl.reportValidity()) return;

    setLoading(method);
    setError(null);

    const fd = new FormData(formEl);
    const totalPhp = total / 100;
    // Shared event ID so the pixel event + the CAPI event the server fires
    // get deduplicated by Meta as a single InitiateCheckout.
    const eventId = newEventId('ic');
    const fb = getFbCookies();

    const payload = {
      name: String(fd.get('name') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      mobile: String(fd.get('mobile') || '').trim(),
      bump,
      paymentMethod: method,
      // Include the applied promo so the server can revalidate + redeem
      // atomically. Partial-discount path still routes through Xendit.
      promoCode: appliedPromo?.code,
      // Meta deduplication + matching fields — server uses these to fire
      // a paired CAPI event with the same eventId, fbp, and fbc.
      meta: {
        eventId,
        fbp: fb.fbp,
        fbc: fb.fbc,
        sourceUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      },
    };

    // AddPaymentInfo — Meta's signal that the buyer selected a payment
    // method. Drives the "Adds of payment info" column in Ads Manager
    // and feeds the "started checkout but didn't pay" retargeting pool.
    trackPixelEvent('AddPaymentInfo', {
      value: totalPhp,
      currency: 'PHP',
      content_name: OFFER.main.name,
      content_ids: [bump ? `${OFFER.main.sku}+${OFFER.oto.sku}` : OFFER.main.sku],
      payment_method: method, // GCASH / CREDIT_CARD / BANKS — custom param
    });

    // Fire pixel InitiateCheckout BEFORE the server hop so it's emitted
    // even if the user closes the tab during /api/checkout latency.
    trackPixelEvent(
      'InitiateCheckout',
      {
        value: totalPhp,
        currency: 'PHP',
        content_name: OFFER.main.name,
        content_ids: [bump ? `${OFFER.main.sku}+${OFFER.oto.sku}` : OFFER.main.sku],
        num_items: bump ? 2 : 1,
      },
      eventId,
    );

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
      setLoading(null);
    }
  }

  /**
   * Free-seat path. Fires when the buyer has applied a 100%-off promo and
   * the Pay buttons have been swapped for "Claim free seat". Same form
   * validation as `payWith`, posts to /api/checkout with no paymentMethod,
   * and follows the /accepted redirect the server returns.
   */
  async function claimFreeSeat(formEl: HTMLFormElement) {
    if (!formEl.reportValidity()) return;
    if (!appliedPromo || !appliedPromo.isFree) return;

    setLoading('FREE');
    setError(null);

    const fd = new FormData(formEl);
    const eventId = newEventId('ic');
    const fb = getFbCookies();
    const payload = {
      name: String(fd.get('name') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      mobile: String(fd.get('mobile') || '').trim(),
      bump,
      promoCode: appliedPromo.code,
      meta: {
        eventId,
        fbp: fb.fbp,
        fbc: fb.fbc,
        sourceUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      },
    };

    // Fire the same Lead-style signal even on a free seat so the audience
    // funnel still tracks the conversion. Value=0 keeps the optimization
    // clean (we don't want Meta optimizing toward free seats).
    trackPixelEvent('Lead', {
      value: 0,
      currency: 'PHP',
      content_name: `${OFFER.main.name} (promo)`,
      content_ids: [OFFER.main.sku],
    });

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not claim seat');
      window.location.href = data.redirectUrl;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(null);
    }
  }

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="grid gap-10 lg:grid-cols-[1.1fr_1fr]"
    >
      {/* Left — fields + bump + CTA */}
      <div>
        <div className="eyebrow">Step 1 of 2 · Secure checkout</div>
        <h1 className="h-section mt-3">Reserve your seat.</h1>
        <p className="mt-3 max-w-md text-sm text-ink-100">
          Pay once. Get the Zoom link, the replay, and the Free Tools stack — instantly.
        </p>

        <div className="mt-8 space-y-5">
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
        </div>

        {/* Order bump card */}
        <BumpCard checked={bump} onChange={handleBumpChange} />

        {/* Promo code row — small, lives between bump card and Pay buttons.
            Pressing Apply hits /api/checkout/promo for a preview; on a 100%
            off code the Pay buttons swap to a single "Claim free seat" CTA. */}
        <PromoField
          value={promoInput}
          onChange={setPromoInput}
          onApply={applyPromo}
          onClear={clearPromo}
          applying={promoApplying}
          applied={appliedPromo}
          errorMessage={promoError}
        />

        {error && (
          <div className="mt-5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Trust line — single testimonial right above Pay button */}
        <CheckoutSocialProof />

        {/* Three explicit pay buttons — each routes to its own Xendit channel,
            so a buyer who clicks "Pay via GCash" lands directly on GCash.
            When a 100%-off promo is applied, swap them for a single
            "Claim free seat" button that bypasses Xendit and goes straight
            to /accepted. */}
        {isFree ? (
          <div className="mt-6">
            <ClaimFreeSeatButton
              loading={loading === 'FREE'}
              disabled={loading !== null}
              onClick={(e) => claimFreeSeat(e.currentTarget.form!)}
            />
            <p className="mt-3 text-center text-[11px] leading-snug text-cyan-300 sm:text-[12px]">
              No payment needed — promo <strong className="font-semibold text-white">{appliedPromo?.code}</strong>{' '}
              covers your seat in full.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <PayButton
              method="GCASH"
              label="Pay via GCash"
              icon={<GCashIcon />}
              price={formatPHP(total)}
              loading={loading === 'GCASH'}
              disabled={loading !== null}
              onClick={(e) => payWith('GCASH', e.currentTarget.form!)}
            />
            <PayButton
              method="CREDIT_CARD"
              label="Pay via Credit Card"
              icon={<CreditCardIcon />}
              price={formatPHP(total)}
              loading={loading === 'CREDIT_CARD'}
              disabled={loading !== null}
              onClick={(e) => payWith('CREDIT_CARD', e.currentTarget.form!)}
            />
            <PayButton
              method="BANKS"
              label="Pay via Bank with QRPH"
              icon={<BankIcon />}
              price={formatPHP(total)}
              loading={loading === 'BANKS'}
              disabled={loading !== null}
              onClick={(e) => payWith('BANKS', e.currentTarget.form!)}
            />
          </div>
        )}

        {/* GCash gotcha hint — the QR on Xendit's page expires fast (~60s)
            and buyers who screenshot it then upload to GCash's scanner get
            an "invalid QR" error. Real fix is to scan the QR live OR let the
            deep-link open GCash directly. We can't change Xendit's flow but
            we can tell the buyer ahead of time. Saw 5+ retries on a single
            buyer in production before adding this. */}
        <p className="mt-3 text-center text-[11px] leading-snug text-ink-300 sm:text-[12px]">
          💡 <strong className="text-ink-100">Paying via GCash?</strong>{' '}
          Don&rsquo;t screenshot the QR — it expires in 60 seconds. On phone:
          tap above and confirm in your GCash app. On desktop: scan the QR
          directly with your phone&rsquo;s GCash camera (don&rsquo;t take a photo).
        </p>

        {/* Security + payment methods — single trust block under the Pay button */}
        <SecurePaymentStrip />

      </div>

      {/* Right — order summary (reactive) */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card">
          <div className="text-[11px] uppercase tracking-[0.22em] text-ink-200">
            Order Summary
          </div>

          {/* Main item */}
          <div className="mt-5 flex items-start justify-between gap-4">
            <div>
              <div className="font-serif text-xl text-white">
                BOSSLABS AI — Live Workshop
              </div>
              <div className="mt-1 text-xs text-ink-200">
                2 hours · Live on Zoom · 7-day replay · Community access
              </div>
            </div>
            <div className="font-serif text-2xl text-white">
              {formatPHP(OFFER.main.priceCentavos)}
            </div>
          </div>

          {/* Bonus items */}
          <ul className="mt-6 space-y-2 border-t border-white/[0.06] pt-6 text-sm text-ink-100">
            {OFFER.bonus.items.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span className="mt-[6px] inline-block h-1.5 w-1.5 flex-none rounded-full bg-cyan-400" />
                {b}
              </li>
            ))}
          </ul>

          {/* Bump line — appears when ticked */}
          {bump && (
            <div className="mt-6 border-t border-cyan-500/30 pt-6">
              <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">
                {OFFER.oto.eyebrow} added
              </div>
              <div className="mt-3 flex items-start justify-between gap-4">
                <div>
                  <div className="font-serif text-lg text-white">
                    {OFFER.oto.name}
                  </div>
                  <div className="mt-1 text-xs text-ink-200">
                    1-hour 1:1 call with the founders · Full AI roadmap
                  </div>
                </div>
                <div className="font-serif text-xl text-cyan-400">
                  {formatPHP(OFFER.oto.priceCentavos)}
                </div>
              </div>
            </div>
          )}

          {/* Promo discount line — only shows when a promo is applied. */}
          {appliedPromo && (
            <div className="mt-6 border-t border-cyan-500/30 pt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-400 sm:text-[11px]">
                    Promo applied
                  </div>
                  <div className="mt-2 font-serif text-base text-white sm:text-lg">
                    {appliedPromo.code}
                  </div>
                  <div className="mt-1 text-[11px] text-ink-200">
                    {appliedPromo.isFree
                      ? '100% off — your seat is comped'
                      : `${formatPHP(appliedPromo.discountCentavos)} off`}
                  </div>
                </div>
                <div className="font-serif text-xl text-cyan-400">
                  −{formatPHP(appliedPromo.discountCentavos)}
                </div>
              </div>
            </div>
          )}

          {/* Total */}
          <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-ink-200">
              Total today
            </div>
            <div className="font-serif text-3xl tracking-tight text-white">
              {isFree ? 'FREE' : formatPHP(total)}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4 text-[12px] leading-relaxed text-ink-200">
          <div className="uppercase tracking-[0.2em] text-emerald-300 text-[10px]">
            100% Full Refund Guarantee
          </div>
          <p className="mt-2">
            Bawal ang hao shao. Show up and do the work — kung hao-shao kami dito,
            email us within 7 days and we refund you <strong className="text-white">100%</strong>, walang tanong.
          </p>
        </div>
      </aside>
    </form>
  );
}

function BumpCard({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={[
        'mt-6 block cursor-pointer rounded-2xl border-2 p-5 transition sm:p-6',
        checked
          ? 'border-cyan-500/70 bg-cyan-500/[0.08] shadow-glow-sm'
          : 'border-cyan-500/30 bg-cyan-500/[0.03] hover:border-cyan-500/55',
      ].join(' ')}
    >
      <div className="flex items-start gap-4">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-5 w-5 flex-none accent-cyan-500"
        />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-400 sm:text-[11px]">
            {OFFER.oto.eyebrow} · Save 50%
          </div>
          <h3 className="font-serif text-lg leading-snug text-white mt-2 sm:text-xl">
            YES — Add the {OFFER.oto.name}
          </h3>
          <ul className="mt-3 space-y-1.5">
            {OFFER.oto.inclusions.map((line) => (
              <li
                key={line}
                className="flex items-start gap-2 font-sans text-[13px] leading-snug text-ink-100 sm:text-[14px]"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="mt-[2px] flex-none text-cyan-400"
                  aria-hidden="true"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="font-serif text-2xl text-cyan-400 sm:text-3xl">
              {OFFER.oto.label}
            </span>
            <span className="font-serif text-base text-ink-300 line-through sm:text-lg">
              {OFFER.oto.crossed}
            </span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
              this page only
            </span>
          </div>
        </div>
      </div>
    </label>
  );
}

/** Single Marco Reyes testimonial right above Pay button — last-second trust */
function CheckoutSocialProof() {
  const win = WINS[0];
  return (
    <figure className="mt-6 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.04] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/[0.08] font-serif text-sm italic text-white">
          {win.name
            .split(' ')
            .map((n) => n[0])
            .join('')}
        </div>
        <div className="min-w-0">
          <blockquote className="font-serif text-[14px] leading-snug text-white sm:text-[15px]">
            "{win.quote}"
          </blockquote>
          <figcaption className="mt-2 text-[10px] uppercase tracking-[0.22em] text-cyan-300 sm:text-[11px]">
            {win.name} · {win.detail.split(' · ').slice(0, 2).join(' · ')}
          </figcaption>
        </div>
      </div>
    </figure>
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

/**
 * PayButton — one of three method-specific CTAs. All three share the same
 * structure (icon, label, price); only the brand affordance and onClick
 * differ. Tap-target sized for mobile (44px+ touch target).
 */
function PayButton({
  method,
  label,
  icon,
  price,
  loading,
  disabled,
  onClick,
}: {
  method: 'GCASH' | 'CREDIT_CARD' | 'BANKS';
  label: string;
  icon: React.ReactNode;
  price: string;
  loading: boolean;
  disabled: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label} — ${price}`}
      data-method={method}
      className="group relative flex w-full items-center gap-3 rounded-full border border-cyan-500/40 bg-gradient-to-r from-cyan-500/[0.12] via-cyan-500/[0.06] to-transparent px-5 py-4 text-left transition hover:border-cyan-400 hover:from-cyan-500/[0.18] hover:to-cyan-500/[0.04] disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
    >
      {/* Brand icon badge */}
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-cyan-500/30 bg-[#06070A]/60 sm:h-10 sm:w-10">
        {icon}
      </span>
      {/* Label + price */}
      <span className="flex flex-1 items-center justify-between gap-3 min-w-0">
        <span className="font-serif text-[15px] leading-tight text-white sm:text-[17px]">
          {loading ? 'Securing your seat…' : label}
        </span>
        <span className="font-serif text-[15px] tracking-tight text-cyan-300 whitespace-nowrap sm:text-[17px]">
          {price}
        </span>
      </span>
      {/* Chevron */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        className="flex-none text-cyan-400 transition group-hover:translate-x-0.5"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/**
 * PromoField — small "Have a promo code?" row. Input + Apply button. Once a
 * code is applied, swaps to a chip showing the applied code with a Remove
 * affordance. Errors render under the row in red.
 */
function PromoField({
  value,
  onChange,
  onApply,
  onClear,
  applying,
  applied,
  errorMessage,
}: {
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
  applying: boolean;
  applied: AppliedPromo | null;
  errorMessage: string | null;
}) {
  if (applied) {
    return (
      <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.06] px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-400">
            Promo applied
          </div>
          <div className="mt-1 truncate font-serif text-base text-white">
            {applied.code}{' '}
            <span className="font-sans text-[12px] text-cyan-300">
              ({applied.isFree
                ? '100% off'
                : applied.discountType === 'percent'
                  ? `${applied.discountValue}% off`
                  : 'discount applied'})
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="flex-none rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium text-ink-200 transition hover:border-white/30 hover:text-white"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <label className="label" htmlFor="promo">
        Have a promo code?
      </label>
      <div className="mt-2 flex items-stretch gap-2">
        <input
          id="promo"
          name="promo"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onApply();
            }
          }}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="ENTER CODE"
          className="input flex-1 font-mono uppercase tracking-wider"
        />
        <button
          type="button"
          onClick={onApply}
          disabled={applying || !value.trim()}
          className="flex-none rounded-full border border-cyan-500/40 bg-cyan-500/[0.10] px-5 text-sm font-medium text-white transition hover:bg-cyan-500/[0.20] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {applying ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {errorMessage && (
        <p className="mt-2 text-[12px] text-red-300">{errorMessage}</p>
      )}
    </div>
  );
}

/**
 * ClaimFreeSeatButton — full-width CTA that replaces the three Pay buttons
 * when a 100%-off promo is applied. Same shape/feel as PayButton so the
 * page layout doesn't jump when the swap happens.
 */
function ClaimFreeSeatButton({
  loading,
  disabled,
  onClick,
}: {
  loading: boolean;
  disabled: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Claim your free seat"
      className="group relative flex w-full items-center gap-3 rounded-full border border-cyan-400 bg-gradient-to-r from-cyan-500/[0.25] via-cyan-500/[0.12] to-transparent px-5 py-4 text-left shadow-glow-sm transition hover:from-cyan-500/[0.35] hover:to-cyan-500/[0.06] disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
    >
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-cyan-400 bg-[#06070A]/60 sm:h-10 sm:w-10">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="#00B8E6"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="flex flex-1 items-center justify-between gap-3 min-w-0">
        <span className="font-serif text-[15px] leading-tight text-white sm:text-[17px]">
          {loading ? 'Locking in your seat…' : 'Claim your free seat'}
        </span>
        <span className="font-serif text-[15px] tracking-tight text-cyan-300 whitespace-nowrap sm:text-[17px]">
          FREE
        </span>
      </span>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        className="flex-none text-cyan-400 transition group-hover:translate-x-0.5"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/* Brand-affordance icons — kept inline so a single file ships the whole
   checkout flow. No external SVG files, no broken-image fallbacks. */

function GCashIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="#0066CC" />
      <text
        x="16"
        y="20.5"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight="800"
        fontSize="11"
        fill="#FFFFFF"
        letterSpacing="-0.5"
      >
        GC
      </text>
    </svg>
  );
}

function CreditCardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" stroke="#00B8E6" strokeWidth="1.6" />
      <path d="M2.5 10h19" stroke="#00B8E6" strokeWidth="1.6" />
      <rect x="5" y="13.5" width="5" height="2" rx="0.5" fill="#00B8E6" />
    </svg>
  );
}

function BankIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 10l9-5 9 5M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"
        stroke="#00B8E6"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * SecurePaymentStrip — sits under the Pay button. Big lock + clear "100%
 * secure / we don't store your data" copy, the 4 payment-method chips, and
 * a small "Powered by Xendit · PCI-DSS Level 1" line. Designed to remove
 * any last-second card hesitation.
 */
function SecurePaymentStrip() {
  return (
    <div className="mt-6 rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.04] p-4 sm:p-5">
      <div className="flex items-start gap-3 sm:items-center">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/[0.10] sm:h-11 sm:w-11">
          <LockIcon size={18} />
        </div>
        <div className="min-w-0">
          <div className="font-serif text-[15px] leading-tight text-white sm:text-[17px]">
            100% Secure Payment
          </div>
          <p className="mt-1 text-[12px] leading-snug text-ink-100 sm:text-[13px]">
            All payments are encrypted end-to-end. We <strong className="font-semibold text-white">never see, touch, or store</strong> your card or payment details.
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
  );
}
