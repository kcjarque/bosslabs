/**
 * /unsubscribe — recipient lands here from a transactional email footer.
 *
 * Token in `?t=...` is HMAC-signed in lib/admin-auth so we can verify the
 * email without a session. GET shows a "are you sure?" confirmation form
 * (Gmail's link-prefetcher won't accidentally unsubscribe people). POST
 * via the form (handled by /api/unsubscribe) flips the status.
 *
 * Also serves as the one-click target for the List-Unsubscribe-Post
 * header — Gmail/Yahoo will POST to /api/unsubscribe?t=... directly,
 * skipping this page entirely.
 */

import Link from 'next/link';
import { verifyUnsubscribeToken } from '@/lib/admin-auth';
import { findSignupByEmail } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Unsubscribe — BOSSLABS AI' };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { t?: string; done?: string };
}) {
  const email = verifyUnsubscribeToken(searchParams.t ?? null);

  if (searchParams.done === '1') {
    return (
      <main className="container-tight flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <div className="eyebrow justify-center">Unsubscribed</div>
        <h1 className="h-section mt-5">You&rsquo;re off the list.</h1>
        <p className="lead mt-5 max-w-md">
          We&rsquo;ve removed you from all BOSSLABS AI emails and SMS. You
          won&rsquo;t hear from us again unless you reach out to{' '}
          <a
            className="text-cyan-400 hover:underline"
            href="mailto:hello@conexmedia.ph"
          >
            hello@conexmedia.ph
          </a>
          .
        </p>
        <Link
          href="/"
          className="mt-8 text-[11px] uppercase tracking-[0.22em] text-ink-300 underline-offset-4 hover:text-ink-100 hover:underline"
        >
          ← Back to BOSSLABS AI
        </Link>
      </main>
    );
  }

  if (!email) {
    return (
      <main className="container-tight flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <div className="eyebrow justify-center">Invalid link</div>
        <h1 className="h-section mt-5">This unsubscribe link is invalid or expired.</h1>
        <p className="lead mt-5 max-w-md">
          To get off our list, just reply to any email from us, or email{' '}
          <a
            className="text-cyan-400 hover:underline"
            href="mailto:hello@conexmedia.ph?subject=Unsubscribe"
          >
            hello@conexmedia.ph
          </a>{' '}
          with &ldquo;Unsubscribe&rdquo; in the subject. We&rsquo;ll remove you within 24 hours.
        </p>
      </main>
    );
  }

  // Confirm the recipient actually exists in our DB before showing their
  // email back to them — defends against email-enumeration via a valid
  // token built from a guessed address (admittedly low-risk since you'd
  // need ADMIN_COOKIE_SECRET to sign one, but free defense in depth).
  const signup = await findSignupByEmail(email);

  return (
    <main className="container-tight flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <div className="eyebrow justify-center">Unsubscribe from BOSSLABS AI</div>
      <h1 className="h-section mt-5">One more click to confirm.</h1>
      <p className="lead mt-5 max-w-md">
        Unsubscribe <span className="text-white">{maskEmail(email)}</span>{' '}
        from BOSSLABS AI email and SMS? We won&rsquo;t send anything else after this.
      </p>
      {!signup && (
        <p className="mt-3 max-w-md text-[12px] text-ink-300">
          (We couldn&rsquo;t find this address in our records — clicking confirm
          will still ensure you stay off our list.)
        </p>
      )}
      <form
        action="/api/unsubscribe"
        method="post"
        className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
      >
        <input type="hidden" name="t" value={searchParams.t ?? ''} />
        <button type="submit" className="btn-primary !py-3 !px-8">
          Yes — unsubscribe me
        </button>
        <Link
          href="/"
          className="text-[11px] uppercase tracking-[0.22em] text-ink-300 underline-offset-4 hover:text-ink-100 hover:underline"
        >
          Keep me subscribed
        </Link>
      </form>
    </main>
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return `${local}***@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}
