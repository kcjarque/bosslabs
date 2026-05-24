/**
 * MetaPixel — installs the Meta Pixel snippet site-wide.
 *
 * This is a SERVER COMPONENT so that next/script can correctly inject
 * the inline `<script>` tag into the SSR HTML. When this was a client
 * component (because of the route-change listener), the Script tag
 * silently failed to render — no PageView, no ViewContent, no events
 * reached Meta at all. The route-change listener now lives in its own
 * client component (RouteChangePageView) which is composed in here.
 *
 * Gated on NEXT_PUBLIC_META_PIXEL_ID so dev/preview without the env
 * var renders nothing (no broken pixel calls, no console noise).
 */

import Script from 'next/script';
import { Suspense } from 'react';
import { RouteChangePageView } from './RouteChangePageView';

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
