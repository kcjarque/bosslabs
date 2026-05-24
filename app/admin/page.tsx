import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { getSettings, getSignups, type Signup } from '@/lib/db';
import { formatPHP } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  requireAdmin();
  const [signups, settings] = await Promise.all([getSignups(), getSettings()]);

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
