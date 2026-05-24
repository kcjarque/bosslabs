'use client';

/**
 * RouteChangePageView — fires fbq('track','PageView') on every Next App
 * Router client-side route transition.
 *
 * Without this, Meta sees 1 PageView per session (the initial one fired
 * by the inline pixel snippet on script load) — kills retargeting
 * audiences and inflates ViewContent ratios. With this, every soft
 * navigation /  → /checkout → /oto → /thank-you etc. counts.
 *
 * Kept in its own file so MetaPixel can stay a server component (next/
 * script's <Script> tag only injects into SSR HTML when rendered from a
 * server component).
 *
 * First-mount fire is skipped via a useRef guard so we don't
 * double-count the page load that already fired PageView via the
 * inline snippet.
 */

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function RouteChangePageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (typeof window === 'undefined') return;
    const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
    if (!fbq) return;
    fbq('track', 'PageView');
  }, [pathname, searchParams]);

  return null;
}
