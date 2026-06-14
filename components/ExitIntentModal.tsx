'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { STUDENT_BUILDS as BUILDS } from '@/lib/config';

/**
 * Exit-intent popup. Fires once per session (per storageKey) when the visitor
 * signals they're leaving:
 *   - Desktop: cursor leaves through the top of the viewport.
 *   - Mobile: the browser back button (we push a dummy history entry on mount).
 *
 * Shows proof — two real student builds — then a CTA. Reused on the landing
 * page (sign-up CTA → /checkout) and the checkout page (CTA just closes so the
 * buyer stays and finishes). Copy is configurable via props.
 */

type Props = {
  storageKey?: string;
  eyebrow?: string;
  title?: string;
  titleAccent?: string;
  sub?: string;
  ctaLabel?: string;
  /** Link target for the CTA. Pass null to make the CTA just close the modal
   *  (e.g. on checkout, keep the buyer on the page). */
  ctaHref?: string | null;
};

export function ExitIntentModal({
  storageKey = 'bl_exit_shown',
  eyebrow = 'Sandali lang, boss',
  title = 'Boss, ayaw mo pa rin',
  titleAccent = 'maniwala?',
  sub = 'See the builds na nabuo namin with our students sa past webinars 👇',
  ctaLabel = 'SIGN UP NOW — only ₱999',
  ctaHref = '/checkout',
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(storageKey)) return;

    // Touch/mobile devices have no hover pointer — use the back-button trap.
    // Fine-pointer (desktop) devices use a true top-edge exit instead, so a
    // trackpad swipe-back or idle cursor never falsely triggers it.
    const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

    let armed = false;
    let engaged = false; // require a real in-page mouse move first
    const armTimer = setTimeout(() => {
      armed = true;
    }, 3000);

    const show = () => {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, '1');
      setOpen(true);
      cleanup();
    };

    const onMove = () => {
      engaged = true;
    };
    // Desktop: fires once when the cursor actually leaves through the TOP edge
    // (toward the tab bar / close button). Not noisy like `mouseout`, and
    // scrolling/idle never moves the pointer out the top.
    const onLeave = (e: MouseEvent) => {
      if (armed && engaged && e.clientY <= 0) show();
    };
    // Mobile only: first back press shows this instead of leaving.
    const onPopState = () => {
      if (armed) show();
    };

    if (isTouch) {
      history.pushState(null, '', window.location.href);
      window.addEventListener('popstate', onPopState);
    } else {
      document.addEventListener('mousemove', onMove);
      document.documentElement.addEventListener('mouseleave', onLeave);
    }

    function cleanup() {
      clearTimeout(armTimer);
      document.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('popstate', onPopState);
    }
    return cleanup;
  }, [storageKey]);

  if (!open) return null;

  const ctaClass = 'btn-primary mt-6 block w-full !py-4 text-center text-base';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div className="relative z-10 max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-cyan-500/30 bg-[#06070A] p-5 shadow-glow sm:p-8">
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-lg text-ink-300 transition hover:bg-white/10 hover:text-white"
        >
          ×
        </button>

        <div className="text-center">
          <div className="eyebrow-danger justify-center">
            <span className="pulse-dot" /> {eyebrow}
          </div>
          <h2 className="mt-4 font-serif text-2xl leading-tight text-white sm:text-3xl">
            {title} <span className="accent-italic">{titleAccent}</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-ink-100 sm:text-base">{sub}</p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {BUILDS.map((b) => (
            <div
              key={b.name}
              className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]"
            >
              <a href={b.url} target="_blank" rel="noopener noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.img}
                  alt={`${b.name} — built with BOSSLABS AI`}
                  className="aspect-[16/10] w-full border-b border-white/10 object-cover object-top"
                  loading="lazy"
                />
              </a>
              <div className="p-4">
                <div className="font-serif text-lg text-white">{b.name}</div>
                <div className="mt-1 text-[12px] leading-snug text-ink-300">{b.tag}</div>
                <a
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200 transition hover:bg-cyan-500/20"
                >
                  See the live build ↗
                </a>
              </div>
            </div>
          ))}
        </div>

        {ctaHref ? (
          <Link href={ctaHref} onClick={() => setOpen(false)} className={ctaClass}>
            {ctaLabel}
          </Link>
        ) : (
          <button onClick={() => setOpen(false)} className={ctaClass}>
            {ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}
