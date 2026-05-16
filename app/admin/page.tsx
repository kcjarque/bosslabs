import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { getSettings, getSignups, type Signup } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  requireAdmin();
  const [signups, settings] = await Promise.all([getSignups(), getSettings()]);

  const now = Date.now();
  const within = (h: number) =>
    signups.filter((s) => now - new Date(s.createdAt).getTime() < h * 3600_000).length;

  const stats = [
    { label: 'Total signups', num: signups.length.toString() },
    { label: 'Last 24 hours', num: within(24).toString() },
    { label: 'Last 7 days', num: within(24 * 7).toString() },
    {
      label: 'Paid tickets',
      num: signups.filter((s) => s.source === 'paid').length.toString(),
    },
  ];

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

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <div className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {s.num}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.06em] text-slate-500 sm:text-xs">
              {s.label}
            </div>
          </div>
        ))}
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
