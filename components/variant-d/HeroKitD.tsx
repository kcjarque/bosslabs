'use client';

/**
 * Variant D hero kit — the ₱500K-quote reframe test (SPEC 2026-07-24).
 * Client pieces only: tracked CTA, the swappable sample-app proof card and
 * the ticking countdown row. Everything else stays server-rendered in
 * OptInPageD.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';

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

/* ─── sample app card — opens the live demo in a new tab (per Kyle: no
       lightbox/modal) ──────────────────────────────────────────────────── */

export type SampleApp = {
  /** /public path of the app screenshot. */
  image: string;
  /** e.g. "Mr. Squidking — Franchise Ops System" */
  label: string;
  /** e.g. "Built in one session · 100% AI coded" */
  sublabel: string;
  /** Live demo URL opened in a new tab on click. */
  demoUrl: string;
};

/* ─── countdown row — bottom half of the hero urgency card ─────────────────
   Sans tabular digits (serif figures are proportional → they jitter every
   second) with unit labels underneath, so the timer reads as one designed
   segment instead of a cramped text line. Hides itself when no valid future
   date is configured — the card above still works as a seats-only meter. */

function useCountdownD(iso?: string) {
  const [target] = useState(() => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) || d.getTime() <= Date.now() ? null : d;
  });
  // Server render + first client paint both show 0 to avoid a hydration
  // mismatch; the first effect tick swaps in the real remaining time.
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!target) return;
    const tick = () => setRemaining(Math.max(0, target.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  const total = Math.floor(remaining / 1000);
  return {
    hasTarget: Boolean(target),
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    mins: Math.floor((total % 3600) / 60),
    secs: total % 60,
  };
}

const pad2 = (n: number) => n.toString().padStart(2, '0');

function CountUnit({ n, label }: { n: number; label: string }) {
  return (
    <span className="flex flex-col items-center">
      <span
        suppressHydrationWarning
        className="font-sans text-lg font-semibold leading-none tabular-nums text-white sm:text-xl"
      >
        {pad2(n)}
      </span>
      <span className="mt-1 font-sans text-[8px] uppercase tracking-[0.16em] text-ink-400 sm:text-[9px]">
        {label}
      </span>
    </span>
  );
}

function CountColon() {
  return (
    <span aria-hidden className="pb-3 font-sans text-base leading-none text-white/25 sm:text-lg">
      :
    </span>
  );
}

export function CountdownRowD({ startsAtIso }: { startsAtIso?: string }) {
  const { hasTarget, days, hours, mins, secs } = useCountdownD(startsAtIso);
  if (!hasTarget) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] bg-black/25 px-4 py-3 sm:px-5">
      <div className="flex items-start gap-2 sm:gap-2.5">
        <CountUnit n={days} label="Days" />
        <CountColon />
        <CountUnit n={hours} label="Hrs" />
        <CountColon />
        <CountUnit n={mins} label="Min" />
        <CountColon />
        <CountUnit n={secs} label="Sec" />
      </div>
      <span className="text-right font-sans text-[9px] uppercase leading-relaxed tracking-[0.18em] text-ink-300 sm:text-[10px]">
        Until your
        <br />
        session goes live
      </span>
    </div>
  );
}

export function SampleAppCard({ app }: { app: SampleApp; ctaLabel?: string }) {
  return (
    <a
      href={app.demoUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackD('sample_app_open', { app: app.label })}
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
          {app.label} <span aria-hidden className="text-cyan-300">↗</span>
        </div>
        <div className="mt-1 text-[12px] text-ink-300 sm:text-[12.5px]">{app.sublabel}</div>
      </div>
    </a>
  );
}
