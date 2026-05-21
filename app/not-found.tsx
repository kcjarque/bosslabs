/**
 * Branded 404 — visitors who hit a URL we don't serve land here instead of
 * the stock Next.js page. Stays on-brand with a clear path back to the funnel.
 */

import Link from 'next/link';

export const metadata = { title: 'Page not found — BOSSLABS AI' };

export default function NotFound() {
  return (
    <main className="container-tight flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <div className="eyebrow justify-center">404</div>
      <h1 className="h-section mt-5">That page doesn&rsquo;t exist.</h1>
      <p className="lead mt-5 max-w-md">
        Probably a stale link from an email or social post. Jump back to the
        main page and we&rsquo;ll route you to the right place.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Link href="/" className="btn-primary !py-3 !px-8">
          Back to home
        </Link>
        <Link
          href="/checkout"
          className="text-[11px] uppercase tracking-[0.22em] text-ink-300 underline-offset-4 hover:text-ink-100 hover:underline"
        >
          Reserve a seat →
        </Link>
      </div>
    </main>
  );
}
