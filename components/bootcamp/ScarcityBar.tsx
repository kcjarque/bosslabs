'use client';

import { useEffect, useState } from 'react';
import { BootcampReserveButton } from '@/components/bootcamp/BootcampReserveButton';
import { BOOTCAMP_TIERS } from '@/lib/bootcamp';

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
          <BootcampReserveButton
            tiers={BOOTCAMP_TIERS}
            seatsLeft={seatsLeft}
            variant="primary"
            label="Reserve →"
            className="!px-4 !py-2 !text-[12.5px] sm:!px-5 sm:!text-[13px]"
          />
        )}
      </div>
    </div>
  );
}
