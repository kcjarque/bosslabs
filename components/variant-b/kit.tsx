'use client';

/**
 * Variant-B conversion kit — motion + primitives. Zero-dependency motion
 * (IntersectionObserver + CSS spring curves) so the perf budget holds: no
 * framer-motion bundle, everything tree-shaken, all gated behind
 * prefers-reduced-motion (instant static fallback).
 */
import {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';

/* ─── reduced-motion hook ─────────────────────────────────────────────── */

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/* ─── in-view hook ────────────────────────────────────────────────────── */

export function useInView<T extends HTMLElement>(threshold = 0.2): [
  React.RefObject<T>,
  boolean,
] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen];
}

/* ─── Reveal — fade + rise on scroll, optional stagger ────────────────── */

export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, seen] = useInView<HTMLDivElement>(0.12);
  const reduced = usePrefersReducedMotion();
  const show = seen || reduced;
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: show ? 1 : 0,
        transform: show ? 'none' : 'translateY(22px)',
        transition: reduced
          ? 'none'
          : `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ─── CountUp — numbers earn themselves on scroll ─────────────────────── */

export function CountUp({
  to,
  prefix = '',
  suffix = '',
  duration = 1400,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const [ref, seen] = useInView<HTMLSpanElement>(0.6);
  const reduced = usePrefersReducedMotion();
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduced) {
      setVal(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      // easeOutExpo — fast start, satisfying settle
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setVal(Math.round(to * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, duration, reduced]);
  return (
    <span ref={ref}>
      {prefix}
      {val.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ─── analytics — Meta Pixel + dataLayer on every CTA / milestone ─────── */

type AnalyticsWindow = {
  fbq?: (...args: unknown[]) => void;
  dataLayer?: Record<string, unknown>[];
};

function emit(event: string, fbEvent: string, data: Record<string, unknown>) {
  try {
    const w = window as unknown as AnalyticsWindow;
    w.fbq?.('trackCustom', fbEvent, data);
    (w.dataLayer ??= []).push({ event, ...data });
  } catch {
    /* analytics is best-effort */
  }
}

export function trackCta(placement: string) {
  emit('cta_click', 'ReserveCTAClick', { placement, variant: 'b' });
}

/** Fires scroll-depth milestones (25/50/75/100) once each. Render once. */
export function ScrollMilestones() {
  useEffect(() => {
    const fired = new Set<number>();
    const onScroll = () => {
      const h = document.documentElement;
      const depth = ((h.scrollTop + window.innerHeight) / h.scrollHeight) * 100;
      for (const m of [25, 50, 75, 100]) {
        if (depth >= m && !fired.has(m)) {
          fired.add(m);
          emit('scroll_depth', 'ScrollDepth', { depth: m, variant: 'b' });
        }
      }
      if (fired.size === 4) window.removeEventListener('scroll', onScroll);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return null;
}

/* ─── CTAButton — the one action, magnetic press states ──────────────── */

export function CTAButton({
  placement,
  children,
  className = '',
  sub,
}: {
  placement: string;
  children: ReactNode;
  className?: string;
  /** One-line proof/trust microcopy rendered under the button. */
  sub?: ReactNode;
}) {
  return (
    <div className={`flex flex-col items-center gap-2.5 ${className}`}>
      <Link
        href="/checkout"
        onClick={() => trackCta(placement)}
        className="group relative inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-8 py-4 text-center text-[16px] font-semibold tracking-tight text-[#06070A] transition-transform duration-200 ease-out [box-shadow:0_0_0_1px_rgba(0,184,230,0.4),0_8px_30px_-8px_rgba(0,184,230,0.55)] hover:bg-cyan-400 hover:[box-shadow:0_0_0_1px_rgba(0,184,230,0.6),0_10px_40px_-8px_rgba(0,184,230,0.75)] active:scale-[0.98] sm:w-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      >
        {children}
        <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
      </Link>
      {sub && (
        <div className="text-center text-[11px] leading-relaxed text-ink-300">{sub}</div>
      )}
    </div>
  );
}

/* ─── Sticky CTA — bottom bar (mobile) + slim top bar (desktop) ───────── */

export function StickyCtaB({ price }: { price: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.9);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <>
      {/* Mobile — bottom bar, safe-area aware, never covers the iOS home bar */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0A0C12]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-transform duration-300 md:hidden ${
          show ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="min-w-0">
            <div className="font-[family-name:var(--font-vb-mono)] text-[15px] font-semibold text-white">
              {price}
            </div>
            <div className="truncate text-[10px] uppercase tracking-[0.14em] text-ink-300">
              7-day guarantee
            </div>
          </div>
          <Link
            href="/checkout"
            onClick={() => trackCta('sticky-mobile')}
            className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-cyan-500 px-5 text-[15px] font-semibold text-[#06070A] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            Reserve a Seat →
          </Link>
        </div>
      </div>

      {/* Desktop — slim top bar once past the hero */}
      <div
        className={`fixed inset-x-0 top-0 z-40 hidden border-b border-white/10 bg-[#06070A]/90 backdrop-blur-md transition-transform duration-300 md:block ${
          show ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="container-tight flex h-14 items-center justify-between">
          <span className="font-[family-name:var(--font-vb-display)] text-sm font-semibold tracking-tight text-white">
            BOSSLABS <span className="text-cyan-400">AI</span>
          </span>
          <div className="flex items-center gap-4">
            <span className="font-[family-name:var(--font-vb-mono)] text-sm text-ink-100">
              <s className="text-ink-400">₱2,997</s>{' '}
              <span className="font-semibold text-white">{price}</span>
            </span>
            <Link
              href="/checkout"
              onClick={() => trackCta('sticky-desktop')}
              className="rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-[#06070A] transition hover:bg-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              Reserve a Seat →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── PriceAnchor — strike-through draws itself on scroll ─────────────── */

export function PriceAnchor({ crossed, price }: { crossed: string; price: string }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.7);
  const reduced = usePrefersReducedMotion();
  const on = seen || reduced;
  return (
    <div ref={ref} className="flex items-baseline justify-center gap-4">
      <span className="relative font-[family-name:var(--font-vb-mono)] text-2xl text-ink-400 sm:text-3xl">
        {crossed}
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-[2px] bg-danger-400"
          style={{
            width: on ? '100%' : '0%',
            transition: reduced ? 'none' : 'width 0.6s cubic-bezier(0.22,1,0.36,1) 0.35s',
          }}
        />
      </span>
      <span
        className="font-[family-name:var(--font-vb-display)] text-6xl font-bold tracking-tight text-white sm:text-7xl"
        style={{
          opacity: on ? 1 : 0,
          transform: on ? 'none' : 'scale(0.92)',
          transition: reduced ? 'none' : 'opacity 0.5s ease 0.7s, transform 0.5s cubic-bezier(0.22,1,0.36,1) 0.7s',
        }}
      >
        {price}
      </span>
    </div>
  );
}

/* ─── Accordion (FAQ) ─────────────────────────────────────────────────── */

export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={i}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02] sm:px-6"
            >
              <span className="text-[15px] font-medium text-white sm:text-base">{it.q}</span>
              <span
                aria-hidden
                className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border border-white/15 text-ink-200 transition-transform duration-300 ${isOpen ? 'rotate-45 border-cyan-500/50 text-cyan-300' : ''}`}
              >
                +
              </span>
            </button>
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-out"
              style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <div className="px-5 pb-5 text-[14px] leading-relaxed text-ink-200 sm:px-6">{it.a}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Carousel (testimonials) — scroll-snap swipe on mobile ───────────── */

export function SnapRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollBy = useCallback((dir: number) => {
    ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.85), behavior: 'smooth' });
  }, []);
  return (
    <div className="relative">
      <div
        ref={ref}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:overflow-visible"
      >
        {children}
      </div>
      <div className="mt-3 flex justify-center gap-2 md:hidden">
        <button
          aria-label="Previous"
          onClick={() => scrollBy(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-ink-200 active:scale-95"
        >
          ←
        </button>
        <button
          aria-label="Next"
          onClick={() => scrollBy(1)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-ink-200 active:scale-95"
        >
          →
        </button>
      </div>
    </div>
  );
}
