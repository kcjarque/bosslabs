/**
 * Email & SMS Logs — one consolidated, time-ordered send feed.
 *
 * Rows come from sent_messages() (see lib/db.listSentMessages). Group sends
 * (sequence blasts, bulk admin) collapse to a single line with a recipient
 * count + delivery breakdown; solo sends (confirmations, recovery, single
 * sends) show their recipient and a status pill. Presentational only.
 */
import Link from 'next/link';
import type { SentMessageRow } from '@/lib/db';

export type Range = '7d' | '30d' | 'all';
type Status = 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'failed';

/** Normalize the ?range= param to a known value (default 30d). */
export function parseRange(v: string | undefined): Range {
  return v === '7d' || v === 'all' ? v : '30d';
}

/** [from, to) ISO window for a range. `to` is tomorrow so today is included. */
export function rangeWindow(range: Range): { from: string; to: string } {
  const now = Date.now();
  const day = 86_400_000;
  const to = new Date(now + day).toISOString();
  if (range === '7d') return { from: new Date(now - 7 * day).toISOString(), to };
  if (range === 'all') return { from: '2020-01-01T00:00:00Z', to };
  return { from: new Date(now - 30 * day).toISOString(), to };
}

const RANGES: { key: Range; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];

function fmtManila(ts: string): string {
  return new Date(ts).toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function StatusPill({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    sent: 'border-slate-200 bg-slate-100 text-slate-600',
    delivered: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    opened: 'border-cyan-300 bg-cyan-50 text-cyan-700',
    clicked: 'border-cyan-400 bg-cyan-100 text-cyan-800',
    bounced: 'border-red-300 bg-red-50 text-red-700',
    complained: 'border-amber-300 bg-amber-50 text-amber-700',
    failed: 'border-red-300 bg-red-50 text-red-700',
  };
  const labels: Record<Status, string> = {
    sent: 'Sent',
    delivered: 'Delivered',
    opened: 'Opened',
    clicked: 'Clicked',
    bounced: 'Bounced',
    complained: 'Spam',
    failed: 'Failed',
  };
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function kindTone(kind: string): string {
  if (kind === 'Sequence') return 'pill-cyan';
  if (kind.startsWith('Retreat')) return 'pill-green';
  if (kind === 'Admin send') return 'pill-amber';
  return '';
}

export function MessagesLog({
  rows,
  channel,
  range,
  basePath,
}: {
  rows: SentMessageRow[];
  channel: 'email' | 'sms';
  range: Range;
  basePath: string;
}) {
  const recipients = rows.reduce((s, r) => s + r.recipients, 0);
  const blasts = rows.filter((r) => r.groupKey).length;
  const solo = rows.length - blasts;

  return (
    <div>
      {/* Range filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`${basePath}?range=${r.key}`}
            className={`btn ${range === r.key ? 'btn-primary' : 'btn-secondary'}`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Entries" value={String(rows.length)} />
        <Kpi label="Recipients reached" value={recipients.toLocaleString()} tone="cyan" />
        <Kpi label="Blasts (grouped)" value={String(blasts)} />
        <Kpi label="Solo sends" value={String(solo)} />
      </div>

      {/* Feed */}
      <div className="card mt-6 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-semibold">When</th>
                <th className="px-4 py-2.5 font-semibold">Type</th>
                <th className="px-4 py-2.5 font-semibold">Detail</th>
                <th className="px-4 py-2.5 font-semibold">{channel === 'email' ? 'To' : 'Mobile'}</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    No {channel === 'email' ? 'emails' : 'texts'} sent in this window.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const isGroup = Boolean(r.groupKey) && r.recipients > 1;
                  return (
                    <tr key={`${r.groupKey ?? r.recipient ?? 'x'}-${r.ts}-${i}`} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{fmtManila(r.ts)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`pill ${kindTone(r.kind)}`}>{r.kind}</span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.label}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {isGroup ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                            <span aria-hidden>👥</span>
                            {r.recipients.toLocaleString()} recipients
                          </span>
                        ) : r.signupId ? (
                          <Link
                            href={`/admin/customers/${r.signupId}`}
                            className="text-cyan-700 underline-offset-2 hover:underline"
                          >
                            {r.recipient ?? '—'}
                          </Link>
                        ) : (
                          r.recipient ?? '—'
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isGroup ? (
                          channel === 'email' ? (
                            <span className="text-[12px] text-slate-500">
                              <span className="text-emerald-700">{r.delivered} delivered</span>
                              {r.opened > 0 && <span className="text-cyan-700"> · {r.opened} opened</span>}
                              {r.bounced > 0 && <span className="text-red-600"> · {r.bounced} bounced</span>}
                            </span>
                          ) : (
                            <span className="text-[12px] text-slate-500">{r.recipients} sent</span>
                          )
                        ) : (
                          <StatusPill status={(r.status as Status) ?? 'sent'} />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'cyan' }) {
  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${tone === 'cyan' ? 'text-cyan-700' : 'text-slate-900'}`}>
        {value}
      </div>
    </div>
  );
}
