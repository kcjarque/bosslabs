'use client';

import { useEffect, useState } from 'react';

/**
 * Sticky retreat offer that slides up after the viewer has been on the
 * replay page for `delayMs` (default 5 minutes) — long enough to be hooked
 * by the replay before we make the pitch. Dismissible.
 */
export function ReplayOffer({
  retreatUrl,
  delayMs = 5 * 60 * 1000,
}: {
  retreatUrl: string;
  delayMs?: number;
}) {
  const [show, setShow] = useState(false);
  const [entered, setEntered] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  useEffect(() => {
    if (!show) return;
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, [show]);

  if (!show || dismissed) return null;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-500 ease-out ${
        entered ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="border-t border-cyan-500/30 bg-[#0B0D12]/95 backdrop-blur-md shadow-[0_-12px_40px_-12px_rgba(0,184,230,0.35)]">
        <div className="container-tight flex flex-col items-center gap-3 py-4 sm:flex-row sm:justify-between sm:py-4">
          <div className="flex items-start gap-3 pr-6">
            <span className="mt-0.5 hidden h-2 w-2 flex-none animate-pulse rounded-full bg-cyan-400 sm:block" />
            <p className="text-sm leading-snug text-ink-100 sm:text-[15px]">
              <span className="font-semibold text-white">
                Ready to build YOUR app?
              </span>{' '}
              The AI Founder's Bootcamp — 24 hours, 80 seats only. Walk out
              with a launched app.
            </p>
          </div>
          <div className="flex flex-none items-center gap-3">
            <a
              href={retreatUrl}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-6 py-2.5 text-sm font-medium text-white transition hover:from-cyan-400 hover:to-indigo-400"
            >
              Reserve your seat →
            </a>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
              className="rounded-full p-1.5 text-ink-300 transition hover:bg-white/5 hover:text-white"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
