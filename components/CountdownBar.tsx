'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

type Props = {
  /** ISO date the webinar starts. When empty, the bar hides itself. */
  startsAtIso?: string;
  message?: string;
};

/** Returns a valid future date, or null when nothing useful to count toward. */
function getTarget(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Past dates: hide the bar rather than show a misleading "00:00:00:00".
  if (d.getTime() <= Date.now()) return null;
  return d;
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function useCountdown(target: Date | null) {
  // Start at 0 to match the server render exactly — avoids hydration mismatch.
  // The first useEffect tick on the client populates the real value.
  const [remaining, setRemaining] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    if (!target) return;
    const tick = () => setRemaining(target.getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  const total = Math.max(0, Math.floor(remaining / 1000));
  return {
    mounted,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    mins: Math.floor((total % 3600) / 60),
    secs: total % 60,
  };
}

/** Thin red sticky bar at the top of every page — global urgency signal. */
export function CountdownBar({
  startsAtIso,
  message = 'Seats close soon — do not get left behind',
}: Props) {
  const pathname = usePathname();
  const [target] = useState(() => getTarget(startsAtIso));
  const { mounted, days, hours, mins, secs } = useCountdown(target);

  // Never show the urgency bar inside the admin or the affiliate dashboard —
  // it's a public-funnel signal, not for those internal/partner views.
  if (
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/affiliate') ||
    pathname?.startsWith('/closer')
  ) {
    return null;
  }
  // No date configured (or already past) → hide the bar entirely rather
  // than show a misleading "+14 days from your page load" timer.
  if (!target) return null;

  return (
    <div className="relative border-b border-danger-400/70 bg-gradient-to-r from-danger-600 via-danger-500 to-danger-600 shadow-[0_2px_24px_-2px_rgba(220,38,38,0.55)]">
      {/* Subtle moving highlight so the bar feels alive without strobing. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 animate-[pulseBar_3.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent"
      />
      <div className="container-tight relative flex flex-col items-center justify-between gap-1.5 py-2 text-center sm:flex-row sm:gap-4 sm:py-2.5 sm:text-left">
        <div className="flex items-center gap-2 whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white sm:gap-2.5 sm:text-[13px] sm:tracking-[0.16em]">
          <span aria-hidden className="text-[13px] leading-none drop-shadow-[0_0_4px_rgba(255,210,210,0.6)] sm:text-[16px]">⚠️</span>
          {/* Short label on mobile so the bar stays 2 lines; full copy on ≥sm. */}
          <span className="sm:hidden">WARNING · SEATS CLOSE SOON</span>
          <span className="hidden sm:inline">
            <span className="text-white">WARNING ·</span>{' '}
            <span className="text-white">{message}</span>
          </span>
        </div>
        <div
          suppressHydrationWarning
          className="flex items-center gap-1.5 font-serif text-sm font-semibold tracking-tight text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.18)] sm:gap-2.5 sm:text-lg"
        >
          <Cell n={mounted ? days : 0} label="D" />
          <Sep />
          <Cell n={mounted ? hours : 0} label="H" />
          <Sep />
          <Cell n={mounted ? mins : 0} label="M" />
          <Sep />
          <Cell n={mounted ? secs : 0} label="S" />
        </div>
      </div>
      <style jsx>{`
        @keyframes pulseBar {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/** Larger standalone display used inside the page (Final Urgency Block). */
export function CountdownDisplay({ startsAtIso }: { startsAtIso?: string }) {
  const [target] = useState(() => getTarget(startsAtIso));
  const { mounted, days, hours, mins, secs } = useCountdown(target);
  // Without a real configured date, render a friendly "soon" pill instead
  // of fake numbers that jump every refresh.
  if (!target) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-danger-500/40 bg-danger-500/[0.08] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-danger-200 sm:text-[12px]">
        <span className="pulse-dot" /> Date locked soon — join the list
      </div>
    );
  }
  return (
    <div
      suppressHydrationWarning
      className="inline-flex items-baseline gap-3 sm:gap-5"
    >
      <BigCell n={mounted ? days : 0} label="Days" />
      <BigSep />
      <BigCell n={mounted ? hours : 0} label="Hours" />
      <BigSep />
      <BigCell n={mounted ? mins : 0} label="Minutes" />
      <BigSep />
      <BigCell n={mounted ? secs : 0} label="Seconds" />
    </div>
  );
}

/** Compact inline countdown (D·H·M·S) for the hero scarcity block. Reuses the
 *  thin-bar Cell style; hides itself when there's no valid future date. */
export function CountdownMini({ startsAtIso }: { startsAtIso?: string }) {
  const [target] = useState(() => getTarget(startsAtIso));
  const { mounted, days, hours, mins, secs } = useCountdown(target);
  if (!target) return null;
  return (
    <div
      suppressHydrationWarning
      className="inline-flex items-center gap-2 font-serif text-sm tracking-tight text-white sm:text-base"
    >
      <Cell n={mounted ? days : 0} label="D" />
      <Sep />
      <Cell n={mounted ? hours : 0} label="H" />
      <Sep />
      <Cell n={mounted ? mins : 0} label="M" />
      <Sep />
      <Cell n={mounted ? secs : 0} label="S" />
    </div>
  );
}

function Cell({ n, label }: { n: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 tabular-nums">
      <span className="font-serif text-base font-semibold text-white sm:text-lg">{pad(n)}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/85">{label}</span>
    </span>
  );
}

function Sep() {
  return <span className="text-white/55">·</span>;
}

function BigCell({ n, label }: { n: number; label: string }) {
  return (
    <span className="inline-flex flex-col items-center">
      <span className="font-serif text-4xl tabular-nums leading-none text-white sm:text-6xl">
        {pad(n)}
      </span>
      <span className="mt-2 text-[10px] uppercase tracking-[0.22em] text-danger-200 sm:text-[11px]">
        {label}
      </span>
    </span>
  );
}

function BigSep() {
  return (
    <span className="font-serif text-3xl leading-none text-danger-300/70 sm:text-5xl">
      :
    </span>
  );
}
