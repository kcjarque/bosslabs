'use client';

/**
 * Variant D hero kit — the ₱350K-quote reframe test (SPEC 2026-07-24).
 * Client pieces only: tracked CTA, the swappable sample-app card + lightbox
 * modal, and the top-countdown suppressor. Everything else in the variant
 * stays server-rendered in OptInPageD.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

/* ─── analytics — Meta Pixel trackCustom + dataLayer, spec §7 names ────── */

type AnalyticsWindow = {
  fbq?: (...args: unknown[]) => void;
  dataLayer?: Record<string, unknown>[];
};

function trackD(event: string, data: Record<string, unknown> = {}) {
  try {
    const w = window as unknown as AnalyticsWindow;
    w.fbq?.('trackCustom', event, { variant: 'd', ...data });
    (w.dataLayer ??= []).push({ event, variant: 'd', ...data });
  } catch {
    /* analytics is best-effort */
  }
}

/* ─── hero CTA — control's primary style + hero_cta_click ──────────────── */

export function HeroCtaD({ label, className = '' }: { label: string; className?: string }) {
  return (
    <Link
      href="/checkout"
      onClick={() => trackD('hero_cta_click')}
      className={`btn-primary !py-4 !px-9 text-base ${className}`}
    >
      {label}
    </Link>
  );
}

/* ─── top countdown suppressor ─────────────────────────────────────────── */

/**
 * The site-wide red countdown strip is rendered by app/layout.tsx for every
 * page. This variant's spec bans countdowns above the fold, but the layout +
 * CountdownBar are shared with the control and must stay untouched — so the
 * variant hides the strip client-side on mount and restores it on unmount.
 * Selector keys on the bar's danger-gradient classes (unique to that strip).
 */
export function HideTopCountdown() {
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(
      'div[class*="from-danger-600"][class*="border-danger-400"]',
    );
    if (!bar) return;
    const prev = bar.style.display;
    bar.style.display = 'none';
    return () => {
      bar.style.display = prev;
    };
  }, []);
  return null;
}

/* ─── sample app card + lightbox modal ─────────────────────────────────── */

export type SampleApp = {
  /** /public path of the app screenshot. */
  image: string;
  /** e.g. "Captain Calamares — Franchise Ops Dashboard" */
  label: string;
  /** e.g. "Built in one session · 100% AI coded" */
  sublabel: string;
  /** Live demo URL loaded in the modal iframe. */
  demoUrl: string;
};

export function SampleAppCard({ app, ctaLabel }: { app: SampleApp; ctaLabel: string }) {
  const [open, setOpen] = useState(false);

  const openModal = useCallback(() => {
    trackD('sample_app_open', { app: app.label });
    setOpen(true);
  }, [app.label]);
  const close = useCallback(() => setOpen(false), []);

  // ESC dismisses; body scroll locks while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="group block w-full overflow-hidden rounded-2xl border border-cyan-500/30 bg-white/[0.02] text-left shadow-glow-sm transition hover:-translate-y-0.5 hover:border-cyan-400/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      >
        <div className="relative overflow-hidden border-b border-white/[0.06]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={app.image}
            alt={app.label}
            className="aspect-[16/10] w-full object-cover object-top transition duration-500 group-hover:scale-[1.02]"
          />
        </div>
        <div className="p-4 sm:p-5">
          <div className="font-sans text-[14px] font-semibold leading-snug text-white sm:text-[15px]">
            {app.label}
          </div>
          <div className="mt-1 text-[12px] text-ink-300 sm:text-[12.5px]">{app.sublabel}</div>
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={app.label}
        >
          <div
            className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0A0C10]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-white sm:text-sm">{app.label}</div>
                <div className="text-[11px] text-ink-300">{app.sublabel}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={app.demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackD('sample_app_external', { app: app.label })}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] text-ink-100 transition hover:border-cyan-400/50 hover:text-white"
                >
                  Open in new tab ↗
                </a>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-ink-100 transition hover:border-white/40 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>
            <iframe
              src={app.demoUrl}
              title={app.label}
              className="min-h-0 w-full flex-1 bg-white"
            />
            <div className="flex flex-col items-center justify-between gap-2.5 border-t border-white/[0.07] bg-white/[0.02] px-4 py-3 sm:flex-row">
              <span className="text-[13px] text-ink-100">This took one session to build.</span>
              <Link
                href="/checkout"
                onClick={() => trackD('sample_app_cta_click')}
                className="btn-primary !px-6 !py-2.5 text-sm"
              >
                {ctaLabel}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
