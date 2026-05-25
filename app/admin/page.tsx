import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { countPageViews, getSettings, getSignups, type Signup } from '@/lib/db';
import { formatPHP, OFFER } from '@/lib/config';

export const dynamic = 'force-dynamic';

/* --------------------------------------------------------------------- */
/* Analytics helpers                                                     */
/* --------------------------------------------------------------------- */

const ABANDONMENT_PRICE_CENTAVOS = OFFER.main.priceCentavos;

/** Bucket signups into the last 30 days (YYYY-MM-DD keys). */
function bucketDaily(signups: Signup[], days = 30) {
  const buckets = new Map<string, { date: string; total: number; paid: number; revenuePhp: number }>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, total: 0, paid: 0, revenuePhp: 0 });
  }
  for (const s of signups) {
    const key = s.createdAt.slice(0, 10);
    const b = buckets.get(key);
    if (!b) continue;
    b.total += 1;
    if (s.status === 'paid' || s.status === 'attended') {
      b.paid += 1;
      const meta = (s.metadata as { otoAmount?: number; otoConfirmed?: string } | undefined) ?? {};
      const otoExtra = meta.otoConfirmed && meta.otoAmount ? meta.otoAmount : 0;
      b.revenuePhp += (s.amountCentavos ?? 0) / 100 + otoExtra;
    }
  }
  return Array.from(buckets.values());
}

/** Count distinct buyers by paymentMethodGroup for paid signups. */
function channelMix(paid: Signup[]) {
  const counts: Record<string, number> = { GCASH: 0, CREDIT_CARD: 0, BANKS: 0, OTHER: 0 };
  for (const s of paid) {
    const m = (s.metadata as { paymentMethodGroup?: string } | undefined)?.paymentMethodGroup;
    if (m && m in counts) counts[m] += 1;
    else counts.OTHER += 1;
  }
  return counts;
}

/** Median time between createdAt and confirmationSent (in seconds). */
function medianTimeToPaySeconds(paid: Signup[]): number | null {
  const deltas: number[] = [];
  for (const s of paid) {
    const sent = (s.metadata as { confirmationSent?: string } | undefined)?.confirmationSent;
    if (!sent) continue;
    const start = new Date(s.createdAt).getTime();
    const end = new Date(sent).getTime();
    if (end > start) deltas.push((end - start) / 1000);
  }
  if (deltas.length === 0) return null;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
}

function formatDuration(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

export default async function AdminDashboard() {
  requireAdmin();
  const since7dIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [signups, settings, viewsAll, viewsCheckout] = await Promise.all([
    getSignups(),
    getSettings(),
    // Top of funnel = anyone who landed on any public page.
    countPageViews({ sinceIso: since7dIso }),
    // Mid-funnel hint = sessions that made it to /checkout.
    countPageViews({ sinceIso: since7dIso, pathPrefix: '/checkout' }),
  ]);

  const now = Date.now();
  const within = (h: number, predicate: (s: Signup) => boolean = () => true) =>
    signups.filter(
      (s) => now - new Date(s.createdAt).getTime() < h * 3600_000 && predicate(s),
    ).length;

  // Status-bucketed counts (the OLD dashboard counted by source='paid' which
  // labelled every checkout-initiator as 'Paid Tickets' even when they
  // hadn't actually paid yet — a misleading metric we just fixed).
  const paid = signups.filter((s) => s.status === 'paid' || s.status === 'attended');
  const registered = signups.filter((s) => s.status === 'registered');
  const refunded = signups.filter((s) => s.status === 'refunded');

  // Revenue from confirmed-paid invoices only. amountCentavos covers main +
  // OTO bump on a single invoice; OTO-after-checkout adds another invoice
  // tracked via metadata.otoConfirmed (added when the BL-OTO webhook fires).
  const revenueCentavos = paid.reduce((sum, s) => {
    const meta = (s.metadata as { otoAmount?: number; otoConfirmed?: string } | undefined) ?? {};
    const otoExtra =
      meta.otoConfirmed && meta.otoAmount ? meta.otoAmount * 100 : 0;
    return sum + (s.amountCentavos ?? 0) + otoExtra;
  }, 0);
  const revenuePhp = revenueCentavos / 100;
  const aovPhp = paid.length > 0 ? revenuePhp / paid.length : 0;

  // Conversion rate = paid / (anyone who hit checkout = registered + paid + refunded).
  // Excludes free-tier signups + contact-form submissions since they aren't
  // funnel-conversion candidates.
  const funnelEntrants = signups.filter((s) => s.source === 'paid').length;
  const conversionRate =
    funnelEntrants > 0 ? (paid.length / funnelEntrants) * 100 : 0;

  // Last-N-hours splits — broken out by paid vs registered for actual signal.
  const last24Paid = within(24, (s) => s.status === 'paid');
  const last24Reg = within(24, (s) => s.status === 'registered');
  const last7dPaid = within(24 * 7, (s) => s.status === 'paid');
  const last7dReg = within(24 * 7, (s) => s.status === 'registered');

  // Abandoned cart deep-dive — every registered signup represents a buyer
  // who got far enough to commit an intent (filled name/email/mobile,
  // clicked Pay, generated a Xendit invoice). Multiply by the price they'd
  // have paid (their amountCentavos already encodes whether they bumped).
  const abandonedRevenuePhp = registered.reduce(
    (sum, s) => sum + (s.amountCentavos ?? ABANDONMENT_PRICE_CENTAVOS) / 100,
    0,
  );
  const abandonedByMethod = registered.reduce<Record<string, number>>((acc, s) => {
    const m = (s.metadata as { paymentMethodGroup?: string } | undefined)?.paymentMethodGroup ?? 'OTHER';
    acc[m] = (acc[m] ?? 0) + 1;
    return acc;
  }, {});
  const oldestAbandonment = registered.reduce<number | null>((min, s) => {
    const age = now - new Date(s.createdAt).getTime();
    return min === null || age > min ? age : min;
  }, null);

  // 30-day daily activity for the chart.
  const daily = bucketDaily(signups, 30);
  const dailyMax = Math.max(1, ...daily.map((d) => d.total));

  // Channel mix on PAID signups (not stuck) — which method works best.
  const paidChannelMix = channelMix(paid);
  const paidChannelTotal = Object.values(paidChannelMix).reduce((a, b) => a + b, 0);

  // OTO attach rate — paid signups whose bumped=true OR who have otoConfirmed.
  const bumpedCount = paid.filter((s) => {
    const meta = (s.metadata as { otoConfirmed?: string } | undefined) ?? {};
    return s.bumped || Boolean(meta.otoConfirmed);
  }).length;
  const otoAttachRate = paid.length > 0 ? (bumpedCount / paid.length) * 100 : 0;

  // Median time-to-pay across paid signups.
  const ttpSec = medianTimeToPaySeconds(paid);

  // 7-day funnel: Visits → Checkout Started → Paid.
  // "Visits" = unique browsers that hit any public page in the window.
  // "Checkout Started" = signups created in the window with paid source
  // (i.e. they filled the form + clicked a Pay button → invoice issued).
  // "Paid" = those that completed payment.
  const last7dStarts = signups.filter(
    (s) => now - new Date(s.createdAt).getTime() < 7 * 24 * 3600_000 && s.source === 'paid',
  ).length;
  const last7dPaidAll = last7dPaid; // paid in last 7d (computed above)
  const visitToCheckoutPct =
    viewsAll.uniqueSessions > 0 ? (last7dStarts / viewsAll.uniqueSessions) * 100 : 0;
  const checkoutToPaidPct =
    last7dStarts > 0 ? (last7dPaidAll / last7dStarts) * 100 : 0;
  const visitToPaidPct =
    viewsAll.uniqueSessions > 0 ? (last7dPaidAll / viewsAll.uniqueSessions) * 100 : 0;
  // For the first few days after the tracker ships, signups in the
  // window outnumber visits (the signups existed before page_views did),
  // so the % comes out > 100%. Render "—" in that case so the dashboard
  // doesn't display nonsense rates while traffic data backfills.
  const fmtRate = (pct: number) => (pct > 100 || !Number.isFinite(pct) ? '—' : `${pct.toFixed(1)}%`);

  const recent = signups.slice(0, 8);
  const channelStatus = {
    email: !!settings.resendApiKey,
    sms: !!settings.onewaysmsUsername && !!settings.onewaysmsPassword,
    messenger: !!settings.messengerGroupUrl,
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Live view of registrations + delivery channels.
          </p>
        </div>
        <Link href="/admin/signups" className="btn btn-secondary self-start sm:self-auto">
          View all signups →
        </Link>
      </header>

      {/* Revenue + headline metrics — these are the numbers that matter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard
          label="Revenue"
          value={formatPHP(revenueCentavos)}
          sub={`${paid.length} paid · AOV ${formatPHP(Math.round(aovPhp * 100))}`}
          tone="green"
        />
        <StatCard
          label="Paid tickets"
          value={paid.length.toString()}
          sub={`+${last24Paid} in 24h · +${last7dPaid} in 7d`}
          tone="green"
        />
        <StatCard
          label="Conversion rate"
          value={`${conversionRate.toFixed(1)}%`}
          sub={`${paid.length} of ${funnelEntrants} checkout-starts`}
        />
        <StatCard
          label="Stuck (unpaid)"
          value={registered.length.toString()}
          sub={`Started checkout, never paid · ${refunded.length} refunded`}
          tone={registered.length > 0 ? 'amber' : undefined}
          href={registered.length > 0 ? '/admin/pending-payments' : undefined}
        />
      </div>

      {/* Funnel + activity row */}
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard
          label="Total signups (all sources)"
          value={signups.length.toString()}
          sub={`${funnelEntrants} via paid funnel`}
        />
        <StatCard
          label="Last 24 hours"
          value={(last24Paid + last24Reg).toString()}
          sub={`${last24Paid} paid · ${last24Reg} stuck`}
        />
        <StatCard
          label="Last 7 days"
          value={(last7dPaid + last7dReg).toString()}
          sub={`${last7dPaid} paid · ${last7dReg} stuck`}
        />
      </div>

      {/* FUNNEL — 7-day Visits → Checkout Started → Paid with step rates */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">7-day funnel</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Unique browser sessions. Tracked since the PageviewTracker shipped —
              older history isn&rsquo;t in the table.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Visits → Paid
            </div>
            <div className="font-serif text-2xl text-slate-900">
              {fmtRate(visitToPaidPct)}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4">
          <FunnelStage
            label="Visits"
            value={viewsAll.uniqueSessions}
            sub={`${viewsAll.total} total beacons`}
            tone="cyan"
            widthPct={100}
          />
          <FunnelStage
            label="Checkout started"
            value={last7dStarts}
            sub={`${fmtRate(visitToCheckoutPct)} of visits`}
            tone="amber"
            widthPct={Math.max(20, Math.min(100, visitToCheckoutPct))}
          />
          <FunnelStage
            label="Paid"
            value={last7dPaidAll}
            sub={`${fmtRate(checkoutToPaidPct)} of checkouts`}
            tone="emerald"
            widthPct={Math.max(20, Math.min(100, checkoutToPaidPct))}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
          <span>
            Sessions that hit /checkout: <strong className="text-slate-700">{viewsCheckout.uniqueSessions}</strong>
          </span>
          <span>·</span>
          <span>
            Browse → intent: <strong className="text-slate-700">{fmtRate(visitToCheckoutPct)}</strong>
          </span>
          <span>·</span>
          <span>
            Intent → close: <strong className="text-slate-700">{fmtRate(checkoutToPaidPct)}</strong>
          </span>
        </div>
      </section>

      {/* ABANDONED CART SPOTLIGHT — visible revenue at risk + one-click recovery */}
      {registered.length > 0 && (
        <Link
          href="/admin/pending-payments"
          className="block rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100/40 p-5 transition hover:border-amber-400 hover:shadow-md sm:p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                Abandoned cart · revenue at risk
              </div>
              <div className="mt-3 flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-semibold tracking-tight text-amber-900 sm:text-4xl">
                  {formatPHP(Math.round(abandonedRevenuePhp * 100))}
                </span>
                <span className="text-sm text-amber-800">
                  across <strong>{registered.length}</strong> stuck buyer{registered.length === 1 ? '' : 's'}
                  {oldestAbandonment !== null && (
                    <> · oldest {formatDuration(oldestAbandonment / 1000)} ago</>
                  )}
                </span>
              </div>
              {/* By-method breakdown */}
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-amber-900">
                {Object.entries(abandonedByMethod)
                  .filter(([, n]) => n > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([method, n]) => (
                    <span
                      key={method}
                      className="rounded-full border border-amber-300/60 bg-white/60 px-2.5 py-0.5"
                    >
                      <strong>{n}</strong>{' '}
                      {method === 'GCASH'
                        ? 'GCash'
                        : method === 'CREDIT_CARD'
                          ? 'Card'
                          : method === 'BANKS'
                            ? 'Banks'
                            : 'Other'}
                    </span>
                  ))}
              </div>
              <p className="mt-3 text-[13px] text-amber-800">
                These buyers filled the form + clicked Pay but never completed.
                Fire a recovery DM/email — most are still within their 24-hour
                Xendit invoice window.
              </p>
            </div>
            <div className="flex-none">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-900 px-4 py-2.5 text-[13px] font-medium text-amber-50">
                Open recovery flow →
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* 30-DAY ACTIVITY CHART */}
      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Last 30 days · signups vs paid
          </h2>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm bg-slate-300" />
              Total
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm bg-emerald-500" />
              Paid
            </span>
          </div>
        </div>
        <DailyChart data={daily} max={dailyMax} />
      </div>

      {/* CHANNEL MIX + OTO ATTACH + TIME-TO-PAY */}
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {/* Payment-method distribution of PAID buyers */}
        <div className="card">
          <div className="text-[11px] uppercase tracking-[0.06em] text-slate-500">
            Payment channel mix (paid)
          </div>
          {paidChannelTotal > 0 ? (
            <div className="mt-3 space-y-2">
              {(['GCASH', 'CREDIT_CARD', 'BANKS', 'OTHER'] as const).map((m) => {
                const n = paidChannelMix[m];
                if (n === 0) return null;
                const pct = (n / paidChannelTotal) * 100;
                const label =
                  m === 'GCASH'
                    ? 'GCash'
                    : m === 'CREDIT_CARD'
                      ? 'Credit Card'
                      : m === 'BANKS'
                        ? 'Banks'
                        : 'Other';
                const color =
                  m === 'GCASH'
                    ? 'bg-cyan-500'
                    : m === 'CREDIT_CARD'
                      ? 'bg-violet-500'
                      : m === 'BANKS'
                        ? 'bg-amber-500'
                        : 'bg-slate-400';
                return (
                  <div key={m}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-medium text-slate-800">{label}</span>
                      <span className="tabular-nums text-slate-500">
                        {n} · {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-slate-500">
              No paid buyers yet — chart populates after first payment.
            </p>
          )}
        </div>

        {/* OTO attach rate */}
        <div className="card">
          <div className="text-[11px] uppercase tracking-[0.06em] text-slate-500">
            OTO attach rate
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {otoAttachRate.toFixed(0)}%
          </div>
          <div className="mt-1 text-[12px] text-slate-500">
            {bumpedCount} of {paid.length} took the 1:1 Audit upsell
          </div>
          <div className="mt-3 text-[11px] text-slate-500">
            Target: 30%+. Each attached audit adds ₱1,997 — at 50% attach
            rate, AOV climbs from ₱999 to ₱2,000+.
          </div>
        </div>

        {/* Median time-to-pay */}
        <div className="card">
          <div className="text-[11px] uppercase tracking-[0.06em] text-slate-500">
            Median time-to-pay
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {formatDuration(ttpSec)}
          </div>
          <div className="mt-1 text-[12px] text-slate-500">
            From form submit to payment confirmed
          </div>
          <div className="mt-3 text-[11px] text-slate-500">
            Under 5min = healthy. 10min+ means buyers are hitting the GCash
            QR expiration loop or hesitating on card details.
          </div>
        </div>
      </div>

      {/* Channel status */}
      <div className="card">
        <h2 className="text-base font-semibold text-slate-900">Delivery channels</h2>
        <p className="mt-1 text-sm text-slate-500">
          Configure tokens in{' '}
          <Link href="/admin/settings" className="text-cyan-600 underline">
            Settings
          </Link>{' '}
          to switch out of demo mode.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <ChannelBadge
            name="Email · Resend"
            ok={channelStatus.email}
            okLabel="Live"
            offLabel="Demo mode"
          />
          <ChannelBadge
            name="SMS · OneWaySMS"
            ok={channelStatus.sms}
            okLabel="Live"
            offLabel="Demo mode"
          />
          <ChannelBadge
            name="Messenger group"
            ok={channelStatus.messenger}
            okLabel="Configured"
            offLabel="Not set"
          />
        </div>
      </div>

      {/* Recent signups */}
      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Recent signups</h2>
          <Link href="/admin/signups" className="text-sm text-slate-500 hover:text-slate-900">
            See all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="hidden sm:table-cell">Email</th>
                  <th className="hidden sm:table-cell">Phone</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <SignupRow key={s.id} s={s} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'green' | 'amber';
  href?: string;
}) {
  const toneClass =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50/40'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50/40'
        : '';
  const body = (
    <div className={`card ${toneClass}`.trim()}>
      <div className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.06em] text-slate-500 sm:text-xs">
        {label}
      </div>
      {sub && <div className="mt-2 text-[11px] text-slate-500">{sub}</div>}
      {href && (
        <div className="mt-2 text-[11px] text-cyan-600 underline-offset-4 hover:underline">
          View →
        </div>
      )}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/**
 * FunnelStage — one bar in the 3-step funnel. The widthPct controls how
 * filled the bar is relative to the previous stage, so visual length
 * communicates drop-off at a glance. Tone keys the bar to the funnel
 * progression: cyan (top, broad), amber (middle, narrowing), emerald
 * (bottom, conversion).
 */
function FunnelStage({
  label,
  value,
  sub,
  tone,
  widthPct,
}: {
  label: string;
  value: number;
  sub: string;
  tone: 'cyan' | 'amber' | 'emerald';
  widthPct: number;
}) {
  const palette = {
    cyan: { fill: 'bg-cyan-500', track: 'bg-cyan-100', text: 'text-cyan-700' },
    amber: { fill: 'bg-amber-500', track: 'bg-amber-100', text: 'text-amber-700' },
    emerald: { fill: 'bg-emerald-500', track: 'bg-emerald-100', text: 'text-emerald-700' },
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className={`text-[10px] font-semibold uppercase tracking-wider ${palette.text}`}>
        {label}
      </div>
      <div className="mt-2 font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl">
        {value.toLocaleString()}
      </div>
      <div className={`mt-3 h-1.5 w-full overflow-hidden rounded-full ${palette.track}`}>
        <div className={`h-full ${palette.fill} transition-all`} style={{ width: `${widthPct}%` }} />
      </div>
      <div className="mt-2 text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

/**
 * DailyChart — inline SVG bar chart, no library. Each day is a stacked
 * column: slate bar for total signups, emerald bar on top for paid.
 * Tooltips via native <title> so hover-on-bar shows the exact numbers.
 */
function DailyChart({
  data,
  max,
}: {
  data: Array<{ date: string; total: number; paid: number; revenuePhp: number }>;
  max: number;
}) {
  const W = 720; // viewBox width — SVG scales to container
  const H = 140;
  const padX = 4;
  const padY = 18;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const slotW = innerW / data.length;
  const barW = Math.max(4, slotW * 0.7);

  // Total revenue across the window for the top-right label.
  const totalRevenue = data.reduce((s, d) => s + d.revenuePhp, 0);
  const totalPaid = data.reduce((s, d) => s + d.paid, 0);

  return (
    <div className="mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full text-slate-300">
        {/* Subtle horizontal gridlines */}
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={W - padX}
            y1={padY + innerH * (1 - t)}
            y2={padY + innerH * (1 - t)}
            stroke="currentColor"
            strokeWidth="0.5"
            opacity="0.3"
            strokeDasharray="2 3"
          />
        ))}
        {data.map((d, i) => {
          const x = padX + slotW * i + (slotW - barW) / 2;
          const totalH = (d.total / max) * innerH;
          const paidH = (d.paid / max) * innerH;
          const totalY = padY + innerH - totalH;
          const paidY = padY + innerH - paidH;
          const dateLabel = new Date(d.date + 'T00:00').toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
          });
          return (
            <g key={d.date}>
              <title>{`${dateLabel} · ${d.total} signups · ${d.paid} paid · ₱${Math.round(d.revenuePhp).toLocaleString()}`}</title>
              {/* Total signups (back) */}
              {d.total > 0 && (
                <rect
                  x={x}
                  y={totalY}
                  width={barW}
                  height={totalH}
                  rx="1"
                  fill="#CBD5E1"
                />
              )}
              {/* Paid (front, overlapping) */}
              {d.paid > 0 && (
                <rect
                  x={x}
                  y={paidY}
                  width={barW}
                  height={paidH}
                  rx="1"
                  fill="#10B981"
                />
              )}
            </g>
          );
        })}
        {/* X-axis: first + middle + last date */}
        <text
          x={padX}
          y={H - 4}
          fontSize="9"
          fill="#94A3B8"
          textAnchor="start"
        >
          {new Date(data[0]?.date + 'T00:00').toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
          })}
        </text>
        <text
          x={W / 2}
          y={H - 4}
          fontSize="9"
          fill="#94A3B8"
          textAnchor="middle"
        >
          {new Date(data[Math.floor(data.length / 2)]?.date + 'T00:00').toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
          })}
        </text>
        <text
          x={W - padX}
          y={H - 4}
          fontSize="9"
          fill="#94A3B8"
          textAnchor="end"
        >
          Today
        </text>
      </svg>
      <div className="mt-2 flex justify-between text-[11px] text-slate-500">
        <span>{data.length} days · hover bars for daily detail</span>
        <span>
          <strong className="text-slate-700">{totalPaid}</strong> paid ·{' '}
          <strong className="text-slate-700">
            {formatPHP(Math.round(totalRevenue * 100))}
          </strong>{' '}
          revenue
        </span>
      </div>
    </div>
  );
}

function ChannelBadge({
  name,
  ok,
  okLabel,
  offLabel,
}: {
  name: string;
  ok: boolean;
  okLabel: string;
  offLabel: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
      <span className="text-sm font-medium text-slate-800">{name}</span>
      <span className={ok ? 'pill pill-green' : 'pill pill-amber'}>
        <span
          className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
            ok ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
        />
        {ok ? okLabel : offLabel}
      </span>
    </div>
  );
}

function SignupRow({ s }: { s: Signup }) {
  return (
    <tr>
      <td>
        <div className="font-medium text-slate-900">
          {s.firstName} {s.lastName ?? ''}
        </div>
        <div className="text-xs text-slate-500 sm:hidden">{s.email}</div>
      </td>
      <td className="hidden sm:table-cell">{s.email}</td>
      <td className="hidden text-slate-500 sm:table-cell">{s.phone}</td>
      <td>
        <SourcePill source={s.source} />
      </td>
      <td>
        <StatusPill status={s.status} />
      </td>
      <td className="text-slate-500">{formatRelative(s.createdAt)}</td>
    </tr>
  );
}

function SourcePill({ source }: { source: Signup['source'] }) {
  const map: Record<Signup['source'], string> = {
    free: 'pill pill-cyan',
    paid: 'pill pill-green',
    contact: 'pill',
  };
  return <span className={map[source]}>{source}</span>;
}

function StatusPill({ status }: { status: Signup['status'] }) {
  const map: Record<Signup['status'], string> = {
    registered: 'pill pill-cyan',
    paid: 'pill pill-green',
    attended: 'pill pill-green',
    'no-show': 'pill pill-amber',
    refunded: 'pill pill-red',
    unsubscribed: 'pill pill-red',
  };
  return <span className={map[status] || 'pill'}>{status}</span>;
}

function Empty() {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm text-slate-500">
        No signups yet. Try the registration form on the landing page — it routes here.
      </p>
    </div>
  );
}

function formatRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
