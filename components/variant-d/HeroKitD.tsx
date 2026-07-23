'use client';

/**
 * Variant D hero kit — the ₱500K-quote reframe test (SPEC 2026-07-24).
 * Client pieces only: tracked CTA + the swappable sample-app proof card.
 * Everything else in the variant stays server-rendered in OptInPageD.
 */
import Link from 'next/link';

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
