/**
 * MetaPixel — installs the Meta Pixel snippet site-wide AND fires PageView
 * on every Next.js App Router client navigation.
 *
 * Why this matters: Next App Router uses client-side route transitions, so
 * the inline `fbq('track','PageView')` in the snippet only fires on the
 * very first load. Without the route-change effect below, Meta sees 1
 * PageView per session — kills retargeting audiences and ViewContent rates.
 *
 * Gated on NEXT_PUBLIC_META_PIXEL_ID so dev/preview without the env var
 * renders nothing (no broken pixel calls, no console noise).
 */

'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

export function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  if (!pixelId) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        />
      </noscript>
      {/* useSearchParams() must be inside a Suspense boundary in App Router */}
      <Suspense fallback={null}>
        <RouteChangePageView />
      </Suspense>
    </>
  );
}

/**
 * Fires fbq('track','PageView') on every pathname change. Skips the very
 * first effect (initial mount) because the inline snippet above already
 * fired PageView for that load — would double-count otherwise.
 */
function RouteChangePageView() {
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
