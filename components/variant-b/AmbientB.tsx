'use client';

/**
 * AmbientB — the living-background system for Variant B.
 *
 * The control page animates only its hero (dotted grid + twinkle + orbs from
 * globals.css). Variant B goes further: the same vocabulary in the hero, PLUS
 * drifting section glows through the whole page, a sweeping light beam, a
 * scroll-progress bar, smooth anchor scrolling, and a gentle hero parallax.
 *
 * Wrapping className="hero-bg" reuses the .twinkle/.orb keyframes (and their
 * prefers-reduced-motion kill switch) already shipped in globals.css — zero
 * duplicate CSS. Everything extra lives in VB_CSS below, also fully gated.
 * Pure CSS animations + one rAF parallax (transform-only): 60fps-friendly.
 */
import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from './kit';

const PARTICLES = [
  { x: 8, y: 18, d: 0 }, { x: 22, y: 72, d: 0.6 }, { x: 35, y: 28, d: 1.4 },
  { x: 48, y: 82, d: 2.1 }, { x: 60, y: 12, d: 0.3 }, { x: 72, y: 64, d: 1.8 },
  { x: 85, y: 30, d: 1.0 }, { x: 92, y: 78, d: 2.4 }, { x: 16, y: 50, d: 3.0 },
  { x: 78, y: 44, d: 2.6 },
];

const VB_CSS = `
@keyframes vbBeam { 0% { transform: translateX(-70vw) rotate(-14deg); opacity: 0; } 18% { opacity: 1; } 82% { opacity: 1; } 100% { transform: translateX(180vw) rotate(-14deg); opacity: 0; } }
.vb-beam { animation: vbBeam 13s ease-in-out infinite; }
@keyframes vbDrift { 0%,100% { transform: translate(0,0) scale(1); opacity: .5; } 50% { transform: translate(34px,-26px) scale(1.12); opacity: .9; } }
.vb-glow { animation: vbDrift 16s ease-in-out infinite; }
@keyframes vbGridPan { from { background-position: 0 0; } to { background-position: 32px 32px; } }
.vb-grid { animation: vbGridPan 9s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .vb-beam, .vb-glow, .vb-grid { animation: none !important; }
}
`;

/** Hero ambient — grid pan + twinkling particles + breathing orbs + beam,
 *  with a soft scroll parallax on the orb layer. */
export function HeroAmbient() {
  const orbsRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (orbsRef.current) {
          orbsRef.current.style.transform = `translateY(${window.scrollY * 0.12}px)`;
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div aria-hidden className="hero-bg pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: VB_CSS }} />

      {/* panning dotted grid — blueprint texture in slow motion */}
      <div className="vb-grid absolute inset-0 opacity-[0.4] [background-image:radial-gradient(circle_at_1px_1px,rgba(0,184,230,0.32)_1px,transparent_0)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_95%)]" />

      {/* twinkling particles (keyframes from globals.css via .hero-bg) */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="twinkle absolute h-[6px] w-[6px] rounded-full bg-cyan-300 shadow-[0_0_10px_3px_rgba(0,184,230,0.55)]"
          style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${p.d}s` }}
        />
      ))}

      {/* breathing orbs on a parallax layer */}
      <div ref={orbsRef} className="absolute inset-0 will-change-transform">
        <div className="orb absolute -left-32 -top-40 h-[420px] w-[420px] rounded-full bg-cyan-500/[0.16] blur-[100px]" />
        <div className="orb absolute -right-40 top-1/3 h-[480px] w-[480px] rounded-full bg-cyan-500/[0.12] blur-[120px]" style={{ animationDelay: '2.5s' }} />
        <div className="orb absolute left-1/4 -bottom-32 h-[360px] w-[360px] rounded-full bg-cyan-500/[0.10] blur-[100px]" style={{ animationDelay: '5s' }} />
      </div>

      {/* sweeping diagonal light beam */}
      <div className="vb-beam absolute -inset-y-1/3 left-0 w-[36%] bg-gradient-to-r from-transparent via-cyan-400/[0.07] to-transparent blur-2xl" />

      {/* clean handoff into the next section */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[#06070A]" />
    </div>
  );
}

/** Drifting glow placed behind any section so the WHOLE page feels alive
 *  (the control only animates its hero). Cheap: one blurred div. */
export function SectionAmbient({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`vb-glow pointer-events-none absolute -z-10 h-[340px] w-[340px] rounded-full bg-cyan-500/[0.07] blur-[110px] ${className}`}
    />
  );
}

/** Thin scroll-progress bar — transform-only, passive listener. */
export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = document.documentElement;
        const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
        if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-[2px] bg-transparent">
      <div
        ref={barRef}
        className="h-full origin-left bg-gradient-to-r from-cyan-600 to-cyan-400 [box-shadow:0_0_8px_rgba(0,184,230,0.6)]"
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  );
}

/** Smooth anchor scrolling while the variant is mounted (and only then —
 *  control keeps browser default). Reduced-motion users keep instant jumps. */
export function SmoothScroll() {
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.documentElement.style.scrollBehavior = prev;
    };
  }, [reduced]);
  return null;
}
