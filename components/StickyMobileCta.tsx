'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { OFFER } from '@/lib/config';

/**
 * Sticky bottom-of-viewport CTA — mobile only.
 *
 * Hidden until the user scrolls past the hero (~500px) so it doesn't compete
 * with the in-hero primary CTA. Pinned with `safe-area-inset-bottom` so it
 * sits above the iOS home indicator. Desktop never shows this bar.
 */
export function StickyMobileCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 520);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-cyan-500/30 bg-[#06070A]/95 backdrop-blur-md transition-transform duration-300 sm:hidden ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0) + 12px)' }}
    >
      <div className="container-tight flex items-center justify-between gap-3 pb-2 pt-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">
            Your seat
          </div>
          <div className="font-serif text-2xl leading-none tracking-tight text-white">
            {OFFER.main.label}
          </div>
        </div>
        <Link
          href="/checkout"
          className="btn-primary !py-3 !px-5 text-[13px]"
        >
          Reserve a Seat
        </Link>
      </div>
    </div>
  );
}
