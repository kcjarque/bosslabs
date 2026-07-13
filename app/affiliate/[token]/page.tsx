import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getAffiliateByToken,
  getAffiliateStats,
  getAffiliateProgram,
  getLeaderboard,
  listCommissions,
  listAffiliateVideos,
  PUBLIC_SITE_URL,
} from '@/lib/affiliates';
import { listAffiliateAdLinks, getAffiliateAdStats } from '@/lib/affiliate-ads';
import { getEvents } from '@/lib/db';
import { formatPHP } from '@/lib/config';
import { CopyLink } from '@/components/CopyLink';
import { CopyButton } from '@/components/CopyButton';
import { AffiliateLinkBuilder } from '@/components/AffiliateLinkBuilder';
import { AffiliateVideoUpload } from '@/components/AffiliateVideoUpload';
import { AffiliateAdsChart } from '@/components/AffiliateAdsChart';
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
  const leaderboard = await getLeaderboard(5);
  const videos = await listAffiliateVideos(aff.id);

  // Linked Meta ads → live impressions + pixel revenue + their commission.
  const adLinks = await listAffiliateAdLinks(aff.id);
  const adStats = adLinks.length
    ? await getAffiliateAdStats(adLinks.map((l) => l.adId), aff.adCommissionPercent)
    : null;
  const compactNum = (n: number) =>
    new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

  // Per-campaign (sub-id) performance from this affiliate's own sales.
  const myCommissions = await listCommissions(aff.id);
  const subAgg = new Map<string, { sales: number; earnings: number }>();
  for (const c of myCommissions) {
    if (c.status === 'void' || c.kind !== 'sale' || !c.sub) continue;
    const cur = subAgg.get(c.sub) ?? { sales: 0, earnings: 0 };
    cur.sales += 1;
    cur.earnings += c.commissionCentavos;
    subAgg.set(c.sub, cur);
  }
  const subRows = [...subAgg.entries()]
    .map(([sub, v]) => ({ sub, ...v }))
    .sort((a, b) => b.sales - a.sales);
  const rate =
    aff.commissionType === 'fixed'
      ? `${formatPHP(aff.commissionValue)} per sale`
      : `${aff.commissionValue}% per sale`;
  const convRate =
    stats.clicks > 0 ? ((stats.paidConversions / stats.clicks) * 100).toFixed(1) : '0.0';

  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {/* ── Greeting — frames BOTH earning paths ── */}
        <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-700">
          BOSSLABS AI · Affiliate
        </div>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-slate-900">
          Hi {aff.name.split(' ')[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Two ways you get paid: the Facebook ads we run for you, and <strong className="text-slate-700">{rate}</strong>{' '}
          for anyone you refer within 15 days of their first click.
        </p>

        {/* ── 1. YOUR ADS — the active earner, leads the page ── */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Your ads</div>
          <p className="mt-1 text-xs text-slate-500">
            The Facebook ads we run for you. You earn{' '}
            <strong className="text-slate-700">{aff.adCommissionPercent}%</strong> of the revenue they generate,
            tracked by the FB pixel.
          </p>

          {!adStats ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <p className="text-[13px] text-slate-500">
                No ads yet. Upload a testimonial video below — we&rsquo;ll run Facebook ads to it, and you earn{' '}
                <strong className="text-slate-700">{aff.adCommissionPercent}%</strong> of every peso they generate.
              </p>
            </div>
          ) : (
            <>
              {/* commission hero — the money, big */}
              <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-5">
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-cyan-700">
                  Your commission · {adStats.windowLabel.toLowerCase()}
                </div>
                <div className="mt-1 font-serif text-4xl tracking-tight text-slate-900">
                  {formatPHP(Math.round(adStats.totals.commission * 100))}
                </div>
                <div className="mt-1 text-[12px] text-slate-500">
                  {aff.adCommissionPercent}% of {formatPHP(Math.round(adStats.totals.revenue * 100))} in ad revenue
                </div>
              </div>

              {/* supporting stats */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Card label="Views" value={compactNum(adStats.totals.impressions)} />
                <Card label="Ad revenue" value={formatPHP(Math.round(adStats.totals.revenue * 100))} />
              </div>

              <div className="mt-5">
                <AffiliateAdsChart daily={adStats.daily} />
              </div>

              {adStats.perAd.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-[12.5px]">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10.5px] uppercase tracking-wide text-slate-400">
                        <th className="py-1.5 pr-3 font-medium">Ad</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Views</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Revenue</th>
                        <th className="py-1.5 text-right font-medium">Your cut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adStats.perAd.map((ad) => (
                        <tr key={ad.adId} className="border-b border-slate-50 last:border-0">
                          <td className="py-1.5 pr-3 text-slate-700">{ad.adName}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">
                            {ad.impressions.toLocaleString()}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">
                            {formatPHP(Math.round(ad.revenue * 100))}
                          </td>
                          <td className="py-1.5 text-right font-semibold tabular-nums text-emerald-700">
                            {formatPHP(Math.round(ad.commission * 100))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-[11px] text-slate-400">
                {adStats.windowLabel} · pulled from Facebook. Commission is on the revenue the pixel attributes to
                your ads.
              </p>
            </>
          )}
        </section>

        {/* ── 2. Testimonial videos — the input that feeds the ads ── */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
            Your testimonial videos
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Record a short, honest video about your experience. We put real ad budget behind it — every peso it
            earns pays you. Your words, our spend, your payday.
          </p>
          <div className="mt-3">
            <AffiliateVideoUpload
              token={params.token}
              initialVideos={videos.map((v) => ({
                id: v.id,
                originalName: v.originalName,
                sizeBytes: v.sizeBytes,
                url: v.url,
                createdAt: v.createdAt,
              }))}
            />
          </div>
        </section>

        {/* ── 3. Referrals — the second earning path ── */}
        <div className="mt-8 text-[11px] uppercase tracking-[0.16em] text-slate-400">Referrals</div>

        {/* Share link */}
        <section className="mt-2 rounded-2xl border border-cyan-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Your link</div>
          <CopyLink url={link} />
          <p className="mt-2 text-xs text-slate-400">
            Share it anywhere. The first link someone clicks is the one that gets credited.
          </p>
        </section>

        {/* Referral numbers */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card label="Clicks" value={String(stats.clicks)} />
          <Card label="Signups" value={String(stats.referredSignups)} />
          <Card label="Sales (paid)" value={String(stats.paidConversions)} />
          <Card label="Conversion" value={`${convRate}%`} />
          <Card label="Pending payout" value={formatPHP(stats.earningsPendingCentavos)} accent />
          <Card label="Paid out" value={formatPHP(stats.earningsPaidCentavos)} />
        </div>

        {/* Link builder — deep links + campaign tags */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Build a custom link</div>
          <p className="mt-1 text-xs text-slate-400">
            Send people to a specific page and tag your campaign — then see which one converts below.
          </p>
          <div className="mt-3">
            <AffiliateLinkBuilder base={PUBLIC_SITE_URL} code={aff.code} />
          </div>
        </section>

        {/* Per-campaign performance */}
        {subRows.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              Your campaigns — what&rsquo;s converting
            </div>
            <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2">Campaign</th>
                    <th>Sales</th>
                    <th className="pr-4 text-right">Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {subRows.map((r) => (
                    <tr key={r.sub} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-mono text-slate-700">{r.sub}</td>
                      <td className="text-slate-900">{r.sales}</td>
                      <td className="pr-4 text-right font-medium text-emerald-700">
                        {formatPHP(r.earnings)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 4. Resources — events, promo kit, leaderboard ── */}
        {upcoming.length > 0 && (
          <div className="mt-8">
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

        {leaderboard.length > 0 && (
          <div className="mt-6">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              Top affiliates this season 🏆
            </div>
            <div className="mt-2 space-y-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              {leaderboard.map((e, i) => {
                const isMe = e.affiliateId === aff.id;
                return (
                  <div
                    key={e.affiliateId}
                    className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
                      isMe ? 'bg-cyan-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-center font-semibold text-slate-400">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </span>
                      <span className="font-medium text-slate-800">
                        {isMe ? 'You' : e.name}
                      </span>
                    </div>
                    <span className="text-sm text-slate-500">
                      {e.sales} sale{e.sales === 1 ? '' : 's'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 5. Settings — get notified ── */}
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
        </section>

        <p className="mt-6 text-center text-[11px] text-slate-400">
          Questions about a payout? Message the BOSSLABS team.
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
