'use client';

import { useEffect, useState } from 'react';

function splitMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Gates the replay video behind a real 7-day deadline. The server passes
 * `initiallyClosed` (so a reload after the deadline shows the closed state
 * immediately — the deadline is genuinely enforced, not just hidden), and
 * the client ticks the countdown down + flips to the closed state at zero.
 */
export function ReplayGate({
  youtubeId,
  closesAtIso,
  endLabel,
  initiallyClosed,
  retreatUrl,
  forceClosed = false,
}: {
  youtubeId: string;
  closesAtIso: string;
  endLabel: string;
  initiallyClosed: boolean;
  retreatUrl: string;
  forceClosed?: boolean;
}) {
  const closesAt = new Date(closesAtIso).getTime();
  const [closed, setClosed] = useState(initiallyClosed);
  const [parts, setParts] = useState<ReturnType<typeof splitMs> | null>(null);

  useEffect(() => {
    if (forceClosed) return;
    const tick = () => {
      const remaining = closesAt - Date.now();
      if (remaining <= 0) {
        setClosed(true);
        setParts({ d: 0, h: 0, m: 0, s: 0 });
      } else {
        setClosed(false);
        setParts(splitMs(remaining));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [closesAt, forceClosed]);

  if (closed || forceClosed) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 sm:p-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/5">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"
                stroke="#9CA0AC"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="h-sub mt-6">The replay has closed.</h2>
          <p className="lead mx-auto mt-4 max-w-md">
            The 7-day replay window ended on{' '}
            <span className="text-white">{endLabel}</span>. As promised, we took
            it down — we don&apos;t do fake deadlines.
          </p>
          <p className="lead mx-auto mt-4 max-w-md">
            You can still build your app with us, in person:
          </p>
          <div className="mt-7">
            <a
              href={retreatUrl}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-9 py-4 text-base font-medium text-white transition hover:from-cyan-400 hover:to-indigo-400"
            >
              Register for the AI Founder's Bootcamp →
            </a>
          </div>
        </div>
      </div>
    );
  }

  const cells: [string, number | undefined][] = [
    ['Days', parts?.d],
    ['Hrs', parts?.h],
    ['Min', parts?.m],
    ['Sec', parts?.s],
  ];

  return (
    <div className="mx-auto max-w-4xl">
      {/* Countdown banner */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5 text-center sm:p-6">
        <div className="eyebrow-danger justify-center">
          <span className="pulse-dot" />
          Available for 7 days only
        </div>
        <div className="mt-4 flex items-center justify-center gap-3 sm:gap-4">
          {cells.map(([label, val]) => (
            <div
              key={label}
              className="min-w-[64px] rounded-xl border border-white/10 bg-black/30 px-2 py-3"
            >
              <div className="font-serif text-3xl tabular-nums text-white sm:text-4xl">
                {val == null ? '—' : pad(val)}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-ink-300">
                {label}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-100">
          Closes <span className="font-semibold text-white">{endLabel}</span>
        </p>
        <p className="mt-1 text-[12px] text-ink-300">
          This is a real deadline — the replay comes down the moment the timer
          hits zero. No fake countdowns here.
        </p>
      </div>

      {/* Video */}
      <div
        className="relative mt-6 w-full overflow-hidden rounded-2xl border border-white/10 shadow-glow"
        style={{ paddingTop: '56.25%' }}
      >
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${youtubeId}`}
          title="AI Vibe Coding 101 — Replay"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </div>
  );
}
