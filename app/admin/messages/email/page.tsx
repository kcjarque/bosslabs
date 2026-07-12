import { requireAdmin } from '@/lib/admin-auth';
import { PageHeader } from '@/components/admin/PageHeader';
import { listEmailLog, type EmailLogStatus } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email Logs · BOSSLABS AI' };

const STATUS_STYLE: Record<string, string> = {
  sent: 'bg-slate-100 text-slate-600',
  delivered: 'bg-sky-100 text-sky-700',
  opened: 'bg-amber-100 text-amber-700',
  clicked: 'bg-emerald-100 text-emerald-700',
  bounced: 'bg-rose-100 text-rose-700',
  complained: 'bg-rose-100 text-rose-700',
};
const STATUSES: EmailLogStatus[] = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'];

function timeAgo(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function EmailLogsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  requireAdmin();
  const status = (searchParams.status || '').trim();
  const q = (searchParams.q || '').trim();
  const rows = await listEmailLog({ limit: 300, status: status || undefined, search: q || undefined });

  // Live counts across the returned window (for the summary chips).
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Email Logs"
        subtitle="Every email sent — one row each — with live delivered → opened → clicked → bounced status from SES. Recorded at the send chokepoint, so 100% of sends (confirmations, drips, retreat, certificates, Hub creds, broadcasts) land here."
      />

      {/* Summary chips */}
      <div className="mb-4 flex flex-wrap gap-2 text-[12px]">
        {STATUSES.map((s) => (
          <span key={s} className={`rounded-full px-2.5 py-1 font-medium ${STATUS_STYLE[s]}`}>
            {s} · {counts[s] ?? 0}
          </span>
        ))}
      </div>

      {/* Filters (server-side, GET form) */}
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search recipient email…"
          className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-cyan-400 focus:outline-none"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Filter
        </button>
        {(q || status) && (
          <a href="/admin/messages/email" className="text-[13px] text-slate-500 hover:underline">
            Clear
          </a>
        )}
      </form>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-[13.5px] text-slate-500">
          No emails logged yet for this filter. New sends appear here the moment they go out, and the
          status updates itself as recipients open + click.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-medium">Sent</th>
                <th className="px-4 py-2.5 font-medium">Recipient</th>
                <th className="px-4 py-2.5 font-medium">Template</th>
                <th className="px-4 py-2.5 font-medium">Subject</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{timeAgo(r.createdAt)}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.toEmail}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">
                    {r.templateId ? <code className="text-[11.5px]">{r.templateId}</code> : '—'}
                  </td>
                  <td className="max-w-[280px] truncate px-4 py-2.5 text-slate-600" title={r.subject ?? ''}>
                    {r.subject ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${
                        STATUS_STYLE[r.status] ?? 'bg-slate-100 text-slate-600'
                      }`}
                      title={r.statusAt ? `at ${timeAgo(r.statusAt)}` : undefined}
                    >
                      {r.status}
                    </span>
                    {r.status === 'bounced' && r.bounceMessage && (
                      <div className="mt-1 max-w-[220px] truncate text-[11px] text-rose-500" title={r.bounceMessage}>
                        {r.bounceMessage}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[12px] text-slate-400">
        Showing the latest {rows.length} of your most recent emails. Status auto-updates from SES open/click events.
      </p>
    </div>
  );
}
