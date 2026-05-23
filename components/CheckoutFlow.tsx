'use client';

import { useEffect, useRef, useState } from 'react';
import { OFFER, WINS, formatPHP } from '@/lib/config';
import { getFbCookies, newEventId, trackPixelEvent } from '@/lib/meta-client';
import { PaymentLogos } from './PaymentLogos';

type PayMethod = 'GCASH' | 'CREDIT_CARD' | 'BANKS';

export function CheckoutFlow() {
  // `loading` is the method currently in flight — lets us spinner just that
  // button while the other two stay disabled (prevents double-submits).
  const [loading, setLoading] = useState<PayMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bump, setBump] = useState(false);

  const total = OFFER.main.priceCentavos + (bump ? OFFER.oto.priceCentavos : 0);

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
      // Meta deduplication + matching fields — server uses these to fire
      // a paired CAPI event with the same eventId, fbp, and fbc.
      meta: {
        eventId,
        fbp: fb.fbp,
        fbc: fb.fbc,
        sourceUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      },
    };

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
        <BumpCard checked={bump} onChange={setBump} />

        {error && (
          <div className="mt-5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Trust line — single testimonial right above Pay button */}
        <CheckoutSocialProof />

        {/* Three explicit pay buttons — each routes to its own Xendit channel,
            so a buyer who clicks "Pay via GCash" lands directly on GCash. */}
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
            label="Pay via Banks"
            icon={<BankIcon />}
            price={formatPHP(total)}
            loading={loading === 'BANKS'}
            disabled={loading !== null}
            onClick={(e) => payWith('BANKS', e.currentTarget.form!)}
          />
        </div>

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
                BOSSLABS AI — Live Webinar
              </div>
              <div className="mt-1 text-xs text-ink-200">
                90 min · Live on Zoom · 7-day replay · Community access
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
                1:1 Audit added
              </div>
              <div className="mt-3 flex items-start justify-between gap-4">
                <div>
                  <div className="font-serif text-lg text-white">
                    One-on-One AI Integration Audit
                  </div>
                  <div className="mt-1 text-xs text-ink-200">
                    45-min private call · Custom integration map
                  </div>
                </div>
                <div className="font-serif text-xl text-cyan-400">
                  {formatPHP(OFFER.oto.priceCentavos)}
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
              {formatPHP(total)}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-[12px] leading-relaxed text-ink-200">
          <div className="uppercase tracking-[0.2em] text-cyan-400 text-[10px]">
            7-day guarantee
          </div>
          <p className="mt-2">
            Show up, do the work. If the frameworks do not apply to your business,
            email us within 7 days — we refund you, no questions.
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
            One-time add-on · Save 60%
          </div>
          <h3 className="font-serif text-lg leading-snug text-white mt-2 sm:text-xl">
            YES — Add a One-on-One AI Integration Audit
          </h3>
          <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink-100 sm:text-[14px]">
            A private 45-minute call with Mikee or Kyle. We audit your business,
            find the ₱100K+ of monthly leaks AI can close, and map your first 3 apps
            to build. You walk away with a custom integration plan — not a course.
            Add it now at half the regular price, this page only.
          </p>
          <div className="mt-3 flex items-baseline gap-3">
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
