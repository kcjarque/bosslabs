'use client';

/**
 * TerminalLive — the self-typing Claude Code terminal. Types the prompt
 * character-by-character when scrolled into view, checks off build steps in
 * sequence, then lands on "Live at …" with a glow micro-celebration. With
 * prefers-reduced-motion it renders the finished state instantly.
 */
import { useEffect, useState } from 'react';
import { useInView, usePrefersReducedMotion } from './kit';

const PROMPT =
  'Build me a CRM for my agency. Track leads, deals, and tasks. Use Supabase + Next.js.';

const TASKS = [
  'Created Lead model',
  'Created Deal pipeline + stages',
  'Built dashboard at /app',
  'Connected to Supabase',
  'Deployed to Vercel',
];

export function TerminalLive() {
  const [ref, seen] = useInView<HTMLDivElement>(0.35);
  const reduced = usePrefersReducedMotion();
  const [typed, setTyped] = useState(0); // chars of PROMPT typed
  const [done, setDone] = useState(0); // tasks checked off
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!seen) return;
    if (reduced) {
      setTyped(PROMPT.length);
      setDone(TASKS.length);
      setLive(true);
      return;
    }
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // 1) type the prompt
    let i = 0;
    const typeNext = () => {
      if (cancelled) return;
      i += 1 + Math.floor(Math.random() * 2); // 1-2 chars per tick — human-fast
      setTyped(Math.min(i, PROMPT.length));
      if (i < PROMPT.length) timers.push(setTimeout(typeNext, 24));
      else {
        // 2) check off tasks in sequence
        TASKS.forEach((_, t) => {
          timers.push(setTimeout(() => !cancelled && setDone(t + 1), 600 + t * 520));
        });
        // 3) live badge celebration
        timers.push(setTimeout(() => !cancelled && setLive(true), 600 + TASKS.length * 520 + 250));
      }
    };
    timers.push(setTimeout(typeNext, 350));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [seen, reduced]);

  return (
    <div ref={ref} className="relative">
      <div aria-hidden className="absolute -inset-6 rounded-3xl bg-cyan-500/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0A0C12] shadow-card">
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-3 font-[family-name:var(--font-vb-mono)] text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
            ~/bosslabs · claude code
          </span>
        </div>

        <div
          className="px-5 py-5 font-[family-name:var(--font-vb-mono)] text-[12px] leading-relaxed text-ink-100 sm:px-6 sm:py-6 sm:text-[13px]"
          aria-live="off"
        >
          <div>
            <span className="text-cyan-400">$</span> <span className="text-white">claude code</span>
          </div>
          <div className="mt-1 text-ink-300">
            <span className="text-cyan-400">Claude Code</span> v1.0 — your terminal-based AI engineer
          </div>

          <div className="my-4 h-px bg-white/[0.06]" />

          <div className="min-h-[3.5rem] sm:min-h-[3rem]">
            <span className="text-cyan-400">&gt;</span>{' '}
            <span className="text-white">{PROMPT.slice(0, typed)}</span>
            {typed < PROMPT.length && (
              <span className="ml-0.5 inline-block h-[1em] w-[7px] translate-y-[2px] animate-pulse bg-cyan-300" aria-hidden />
            )}
          </div>

          <div className="mt-3 space-y-1.5">
            {TASKS.map((label, t) => (
              <div
                key={label}
                className="flex items-center gap-2 transition-opacity duration-300"
                style={{ opacity: done > t ? 1 : 0.25 }}
              >
                <span
                  className={`flex h-4 w-4 flex-none items-center justify-center rounded-full text-[9px] ${
                    done > t ? 'bg-emerald-500/20 text-emerald-300' : 'border border-white/15 text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span className={done > t ? 'text-ink-100' : 'text-ink-400'}>{label}</span>
              </div>
            ))}
          </div>

          <div
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 transition-all duration-500"
            style={{
              opacity: live ? 1 : 0,
              transform: live ? 'none' : 'translateY(6px)',
              boxShadow: live ? '0 0 24px -4px rgba(0,184,230,0.5)' : 'none',
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 [box-shadow:0_0_8px_2px_rgba(0,184,230,0.6)]" />
            <span className="text-[11px] text-cyan-200">Live at bosslabs-crm.vercel.app</span>
          </div>
        </div>
      </div>
    </div>
  );
}
