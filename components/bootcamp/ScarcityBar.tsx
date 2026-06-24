'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export function ScarcityBar({
  seatsLeft,
  totalSeats,
}: {
  seatsLeft: number;
  totalSeats: number;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const taken = totalSeats - seatsLeft;
  const pct = Math.min(100, Math.round((taken / totalSeats) * 100));
  const urgency = seatsLeft <= 10 ? 'high' : seatsLeft <= 30 ? 'mid' : 'low';
  const dotColor =
    urgency === 'high' ? 'bg-rose-400' : urgency === 'mid' ? 'bg-amber-400' : 'bg-cyan-400';
  const dotGlow =
    urgency === 'high'
      ? 'shadow-[0_0_12px_rgba(244,63,94,0.9)]'
      : urgency === 'mid'
        ? 'shadow-[0_0_12px_rgba(251,191,36,0.85)]'
        : 'shadow-[0_0_12px_rgba(0,184,230,0.9)]';

  return (
    <div
      className={`fixed inset-x-0 top-0 z-30 border-b border-white/[0.06] bg-[#06070A]/85 backdrop-blur-xl transition-transform duration-300 ${
        visible ? 'translate-y-0' : '-translate-y-full'
      }`}
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`h-2 w-2 flex-none rounded-full ${dotColor} ${dotGlow} animate-pulse-soft`} />
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold text-white sm:text-[13.5px]">
              AI Founder's Bootcamp · {seatsLeft === 0 ? 'Sold out' : `${seatsLeft} seats left`}
            </div>
            <div className="hidden text-[11px] text-ink-300 sm:block">
              80-seat cohort · {pct}% filled
            </div>
          </div>
        </div>
        {seatsLeft > 0 && (
          <Link
            href="/founders-bootcamp/reserve"
            className="rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(0,150,200,0.65)] transition hover:from-cyan-400 hover:to-indigo-400 active:translate-y-[1px] sm:px-5 sm:text-[13px]"
          >
            Reserve →
          </Link>
        )}
      </div>
    </div>
  );
}
