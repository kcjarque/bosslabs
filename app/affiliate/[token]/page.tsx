import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getAffiliateByToken,
  getAffiliateStats,
  getAffiliateProgram,
  PUBLIC_SITE_URL,
} from '@/lib/affiliates';
import { getEvents } from '@/lib/db';
import { formatPHP } from '@/lib/config';
import { CopyLink } from '@/components/CopyLink';
import { CopyButton } from '@/components/CopyButton';
import { updateAffiliateContactAction } from './actions';

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
  const program = await getAffiliateProgram();
  const hasResources = Boolean(program.swipeCopy || program.assetsUrl || program.onePagerUrl);
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

        {/* Promo kit */}
        {hasResources && (
          <div className="mt-6">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              Promo kit — everything you need to post
            </div>
            <div className="mt-2 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {program.swipeCopy && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Swipe copy &amp; captions
                    </span>
                    <CopyButton text={program.swipeCopy} label="Copy caption" />
                  </div>
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm leading-relaxed text-slate-700">
                    {program.swipeCopy}
                  </pre>
                </div>
              )}
              {(program.assetsUrl || program.onePagerUrl) && (
                <div className="flex flex-wrap gap-2">
                  {program.assetsUrl && (
                    <a
                      href={program.assetsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
                    >
                      Images + video pack ↗
                    </a>
                  )}
                  {program.onePagerUrl && (
                    <a
                      href={program.onePagerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
                    >
                      Why-this-webinar one-pager ↗
                    </a>
                  )}
                </div>
              )}
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

        {/* Get notified */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
            Get notified the moment you earn
          </div>
          <form action={updateAffiliateContactAction} className="mt-3 space-y-3">
            <input type="hidden" name="token" value={aff.dashboardToken} />
            <input
              name="email"
              type="email"
              defaultValue={aff.email}
              placeholder="your@email.com"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-500"
            />
            <input
              name="telegramChatId"
              defaultValue={aff.telegramChatId}
              placeholder="Telegram chat ID (optional)"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-500"
            />
            <div className="flex flex-wrap gap-4 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="notifyEmail" defaultChecked={aff.notifyEmail} /> Email me
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="notifyTelegram" defaultChecked={aff.notifyTelegram} /> Telegram me
              </label>
            </div>
            <button className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700">
              Save
            </button>
          </form>
          <p className="mt-2 text-[11px] text-slate-400">
            For Telegram alerts: open Telegram, message <span className="font-mono">@userinfobot</span> to get your
            chat ID, then paste it above.
          </p>
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
