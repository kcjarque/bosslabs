import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAffiliateByToken, getAffiliateStats, PUBLIC_SITE_URL } from '@/lib/affiliates';
import { getEvents } from '@/lib/db';
import { formatPHP } from '@/lib/config';
import { CopyLink } from '@/components/CopyLink';

function formatEventDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(t);
}

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your affiliate dashboard',
  robots: { index: false, follow: false },
};

export default async function AffiliateDashboard({
  params,
}: {
  params: { token: string };
}) {
  const aff = await getAffiliateByToken(params.token);
  if (!aff) notFound();
  const stats = await getAffiliateStats(aff);
  const link = `${PUBLIC_SITE_URL}/r/${aff.code}`;

  // Upcoming events the affiliate is driving signups to.
  const now = Date.now();
  const upcoming = (await getEvents())
    .filter((e) => e.active && Date.parse(e.startsAtIso) > now)
    .sort((a, b) => Date.parse(a.startsAtIso) - Date.parse(b.startsAtIso));
  const rate =
    aff.commissionType === 'fixed'
      ? `${formatPHP(aff.commissionValue)} per sale`
      : `${aff.commissionValue}% per sale`;
  const convRate =
    stats.clicks > 0 ? ((stats.paidConversions / stats.clicks) * 100).toFixed(1) : '0.0';

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-700">
          BOSSLABS AI · Affiliate
        </div>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-slate-900">
          Hi {aff.name.split(' ')[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          You earn <strong className="text-slate-700">{rate}</strong>. Share your link below —
          you get credited for anyone who buys within 15 days of their first click.
        </p>

        {/* Share link */}
        <div className="mt-6 rounded-2xl border border-cyan-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Your link</div>
          <CopyLink url={link} />
          <p className="mt-2 text-xs text-slate-400">
            Share it anywhere. The first link someone clicks is the one that gets credited.
          </p>
        </div>

        {/* Live events the affiliate is promoting */}
        {upcoming.length > 0 && (
          <div className="mt-6">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              What&rsquo;s on — events you&rsquo;re promoting
            </div>
            <div className="mt-2 space-y-2">
              {upcoming.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900">{ev.name}</div>
                    <div className="text-xs text-slate-500">{formatEventDate(ev.startsAtIso)}</div>
                  </div>
                  <span className="flex-none rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
                    ● Live
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card label="Clicks" value={String(stats.clicks)} />
          <Card label="Signups" value={String(stats.referredSignups)} />
          <Card label="Sales (paid)" value={String(stats.paidConversions)} />
          <Card label="Conversion" value={`${convRate}%`} />
          <Card label="Pending payout" value={formatPHP(stats.earningsPendingCentavos)} accent />
          <Card label="Paid out" value={formatPHP(stats.earningsPaidCentavos)} />
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-400">
          Updated live. Questions about a payout? Message the BOSSLABS team.
        </p>
      </div>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="text-xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">{label}</div>
    </div>
  );
}
