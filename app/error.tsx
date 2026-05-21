'use client';

/**
 * Global error boundary — catches uncaught render errors on any route so
 * the visitor never sees Next.js's stock white error screen. Branded
 * fallback with a "try again" reset and a way home.
 */

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error to whatever observability we plug in later. For now
    // it lives in Vercel function logs as a regular console.error entry.
    console.error('[render-error]', error.digest ?? '', error.message);
  }, [error]);

  return (
    <main className="container-tight flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <div className="eyebrow justify-center">Something broke</div>
      <h1 className="h-section mt-5">
        Sorry — that didn&rsquo;t load right.
      </h1>
      <p className="lead mt-5 max-w-md">
        We&rsquo;ve been pinged. Try again, or head back to the home page and
        we&rsquo;ll route you to the right place.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => reset()}
          className="btn-primary !py-3 !px-8"
        >
          Try again
        </button>
        <Link
          href="/"
          className="text-[11px] uppercase tracking-[0.22em] text-ink-300 underline-offset-4 hover:text-ink-100 hover:underline"
        >
          ← Back to home
        </Link>
      </div>
      {error.digest && (
        <p className="mt-8 text-[10px] uppercase tracking-[0.18em] text-ink-300">
          Ref: {error.digest}
        </p>
      )}
    </main>
  );
}
