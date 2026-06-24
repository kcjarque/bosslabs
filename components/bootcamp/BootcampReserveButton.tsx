'use client';

import { useState } from 'react';
import type { BootcampTier, BootcampTierDef } from '@/lib/bootcamp';
import { BootcampReserveModal } from './BootcampReserveModal';

/**
 * Drop-in button that opens the reservation modal. Pass any of the visual
 * `variant`s used across the landing (primary CTA, ghost link, tier-card
 * footer) so the modal can be triggered from any surface without spawning a
 * separate modal instance per button.
 */
type Variant = 'primary' | 'soft' | 'ghost' | 'tierFooter';

export function BootcampReserveButton({
  tiers,
  seatsLeft,
  presetTier,
  variant = 'primary',
  label,
  className,
  children,
  featured,
}: {
  tiers: BootcampTierDef[];
  seatsLeft: number;
  presetTier?: BootcampTier;
  variant?: Variant;
  label?: string;
  className?: string;
  children?: React.ReactNode;
  /** When true on a tier-card footer, use the cyan-gradient pill. */
  featured?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const disabled = seatsLeft <= 0;
  const text = label ?? 'Reserve a seat →';

  const baseByVariant: Record<Variant, string> = {
    primary:
      'group inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-7 py-4 text-base font-semibold text-white shadow-[0_18px_44px_-12px_rgba(0,150,200,0.7)] transition hover:from-cyan-400 hover:to-indigo-400 active:translate-y-[1px]',
    soft:
      'flex items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/[0.08] px-5 py-3 text-sm font-semibold text-cyan-200 transition hover:border-cyan-400/70 hover:bg-cyan-500/[0.14]',
    ghost:
      'hidden rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/85 transition hover:border-cyan-400/50 hover:bg-cyan-500/[0.08] hover:text-white sm:inline-flex',
    tierFooter: featured
      ? 'mt-5 flex items-center justify-between rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2.5 text-[13px] font-semibold text-white transition'
      : 'mt-5 flex items-center justify-between rounded-full bg-white/[0.05] px-4 py-2.5 text-[13px] font-semibold text-white transition group-hover:bg-white/[0.1]',
  };

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className={`${baseByVariant[variant]} ${className ?? ''} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        {children ?? text}
      </button>
      <BootcampReserveModal
        tiers={tiers}
        presetTier={presetTier}
        seatsLeft={seatsLeft}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
