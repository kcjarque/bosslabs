'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Exit-intent popup for the landing page. Fires once per session when the
 * visitor signals they're leaving:
 *   - Desktop: cursor leaves through the top of the viewport (toward the tab
 *     bar / close button).
 *   - Mobile: the browser back button (we push a dummy history entry on mount
 *     so the first back press shows this instead of navigating away).
 *
 * Shows proof — two real student builds — then a ₱999 sign-up CTA.
 */

const BUILDS = [
  {
    name: 'EstateConnect',
    tag: 'Real-estate agent assignment & live chat',
    img: '/realestate-app.png',
    url: 'https://realestate-kappa-liard.vercel.app/',
  },
  {
    name: 'Sentinel',
    tag: 'Real-time security operations platform',
    img: '/preclarus-app.png',
    url: 'https://preclarus-app.vercel.app/',
  },
];

const SEEN_KEY = 'bl_exit_shown';

export function ExitIntentModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SEEN_KEY)) return;

    // Small arm delay so it can't fire on the very first paint / accidental
    // pointer flick as the page loads.
    let armed = false;
    const armTimer = setTimeout(() => {
      armed = true;
    }, 3500);

    const show = () => {
      if (sessionStorage.getItem(SEEN_KEY)) return;
      sessionStorage.setItem(SEEN_KEY, '1');
      setOpen(true);
      cleanup();
    };

    // Desktop: cursor exits through the top edge.
    const onMouseOut = (e: MouseEvent) => {
      if (armed && !e.relatedTarget && e.clientY <= 0) show();
    };
    // Mobile: back-button trap (one-shot — after firing, back works normally).
    const onPopState = () => {
      if (armed) show();
    };

    history.pushState(null, '', window.location.href);
    document.addEventListener('mouseout', onMouseOut);
    window.addEventListener('popstate', onPopState);

    function cleanup() {
      clearTimeout(armTimer);
      document.removeEventListener('mouseout', onMouseOut);
      window.removeEventListener('popstate', onPopState);
    }
    return cleanup;
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div className="relative z-10 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-cyan-500/30 bg-[#06070A] p-5 shadow-glow sm:p-8">
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-lg text-ink-300 transition hover:bg-white/10 hover:text-white"
        >
          ×
        </button>

        <div className="text-center">
          <div className="eyebrow-danger justify-center">
            <span className="pulse-dot" /> Sandali lang, boss
          </div>
          <h2 className="mt-4 font-serif text-2xl leading-tight text-white sm:text-3xl">
            Boss, ayaw mo pa rin <span className="accent-italic">maniwala?</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-ink-100 sm:text-base">
            See the builds na nabuo namin with our students sa past webinars 👇
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
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

        <Link
          href="/checkout"
          onClick={() => setOpen(false)}
          className="btn-primary mt-6 block w-full !py-4 text-center text-base"
        >
          SIGN UP NOW — only ₱999
        </Link>
      </div>
    </div>
  );
}
