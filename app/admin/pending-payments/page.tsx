/**
 * /admin/pending-payments — shows buyers who hit checkout but haven't
 * paid yet. Groups by email so you spot retry patterns (someone trying
 * 3+ times = probably stuck on the GCash QR expiration issue).
 *
 * Each row gives you a fresh Xendit invoice URL you can DM the buyer
 * along with our "don't screenshot the QR" recovery instructions.
 */

import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { getSignups, type Signup } from '@/lib/db';
import { OFFER } from '@/lib/config';
import { SendRecoveryButton } from '@/components/SendRecoveryButton';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Group = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  attempts: Signup[];
  latest: Signup;
};

function groupByEmail(signups: Signup[]): Group[] {
  const map = new Map<string, Group>();
  for (const s of signups) {
    if (s.status !== 'registered') continue;
    const key = s.email.toLowerCase();
    const g = map.get(key);
    if (g) {
      g.attempts.push(s);
      if (new Date(s.createdAt) > new Date(g.latest.createdAt)) g.latest = s;
    } else {
      map.set(key, {
        email: s.email,
        firstName: s.firstName,
        lastName: s.lastName ?? '',
        phone: s.phone,
        attempts: [s],
        latest: s,
      });
    }
  }
  // Sort: most attempts first (most likely stuck), then most recent.
  return Array.from(map.values()).sort((a, b) => {
    if (b.attempts.length !== a.attempts.length) return b.attempts.length - a.attempts.length;
    return new Date(b.latest.createdAt).getTime() - new Date(a.latest.createdAt).getTime();
  });
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function PendingPaymentsPage() {
  requireAdmin();
  const all = await getSignups();
  const groups = groupByEmail(all);

  const stuck = groups.filter((g) => g.attempts.length >= 2);
  const single = groups.filter((g) => g.attempts.length === 1);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Pending payments
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Buyers who clicked Pay but haven&rsquo;t completed. 2+ attempts from the
          same email usually means GCash QR expired — DM them the recovery
          script below.
        </p>
      </header>

      {/* GCash recovery script — admin can copy-paste */}
      <section className="card border-amber-200 bg-amber-50">
        <h2 className="text-base font-semibold text-amber-900">
          DM script for &ldquo;QR invalid&rdquo; complaints
        </h2>
        <div className="mt-2 rounded-lg bg-white p-3 text-[13px] leading-relaxed text-slate-800">
          Hey! The QR says invalid because it expires fast (under 2 minutes) — and
          screenshots stop working after a few seconds.
          <br />
          <br />
          <strong>Don&rsquo;t screenshot the QR.</strong> Instead:
          <br />
          <br />
          • On phone: go to{' '}
          <strong>bosslabs.live/checkout</strong> → fill the form → tap &ldquo;Pay
          via GCash&rdquo; → confirm in GCash. Done.
          <br />
          <br />
          • If GCash doesn&rsquo;t auto-open: open GCash on the same phone, tap
          &ldquo;Scan QR&rdquo;, point the camera at your own screen showing the
          QR. Don&rsquo;t upload a screenshot.
          <br />
          <br />
          • If the QR expires while scanning, just go back to BOSSLABS and tap
          Pay via GCash again to get a fresh QR.
        </div>
      </section>

      {stuck.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-red-900">
            🔴 Multiple attempts ({stuck.length}) — likely stuck on GCash QR
          </h2>
          {stuck.map((g) => <PendingRow key={g.email} group={g} flagged />)}
        </section>
      )}

      {single.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-700">
            Single attempt ({single.length})
          </h2>
          {single.map((g) => <PendingRow key={g.email} group={g} flagged={false} />)}
        </section>
      )}

      {groups.length === 0 && (
        <section className="card text-center text-sm text-slate-500">
          No pending payments. Everyone who started checkout completed it.
        </section>
      )}
    </div>
  );
}

function PendingRow({ group, flagged }: { group: Group; flagged: boolean }) {
  const amount = (group.latest.amountCentavos ?? OFFER.main.priceCentavos) / 100;
  return (
    <div className={`card ${flagged ? 'border-red-200 bg-red-50/30' : ''}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-[14px] text-slate-900">
              {group.firstName} {group.lastName}
            </strong>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                flagged
                  ? 'bg-red-100 text-red-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {group.attempts.length} attempt{group.attempts.length === 1 ? '' : 's'}
            </span>
            <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cyan-700">
              ₱{amount}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-slate-600">
            {group.email} · {group.phone || 'no phone'}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Latest: {timeSince(group.latest.createdAt)} ·{' '}
            <span className="font-mono">
              {(group.latest.metadata as { externalId?: string } | undefined)?.externalId}
            </span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-[11px] sm:text-right">
          <SendRecoveryButton
            signupId={group.latest.id}
            firstName={group.firstName}
            email={group.email}
            phone={group.phone}
            alreadySentAt={
              (group.latest.metadata as { recoveryEmailSent?: string } | undefined)
                ?.recoveryEmailSent
            }
            smsSentAt={
              (group.latest.metadata as { recoverySmsSent?: string } | undefined)
                ?.recoverySmsSent
            }
            emailStatus={
              (group.latest.metadata as {
                recoveryEmailStatus?:
                  | 'sent'
                  | 'delivered'
                  | 'opened'
                  | 'clicked'
                  | 'bounced'
                  | 'complained';
              } | undefined)?.recoveryEmailStatus
            }
          />
          {group.phone && (
            <a
              href={`https://m.me/${group.phone}`}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-600 underline-offset-4 hover:underline"
            >
              Messenger ↗
            </a>
          )}
          <Link
            href={`/admin/signups?q=${encodeURIComponent(group.email)}`}
            className="text-slate-500 underline-offset-4 hover:underline"
          >
            View in signups →
          </Link>
        </div>
      </div>
    </div>
  );
}
