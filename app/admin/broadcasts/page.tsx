import { requireAdmin } from '@/lib/admin-auth';
import { PageHeader } from '@/components/admin/PageHeader';
import { getLists } from '@/lib/db';
import { listScheduledBroadcasts } from '@/lib/broadcasts';
import { BroadcastComposer } from '@/components/admin/BroadcastComposer';
import { cancelBroadcastAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Broadcasts · BOSSLABS AI' };

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-amber-50 text-amber-700',
  sending: 'bg-blue-50 text-blue-700',
  sent: 'bg-emerald-50 text-emerald-700',
  canceled: 'bg-slate-100 text-slate-500',
  failed: 'bg-red-50 text-red-700',
};

export default async function BroadcastsPage() {
  requireAdmin();
  const [lists, broadcasts] = await Promise.all([getLists(), listScheduledBroadcasts()]);
  const listName = new Map(lists.map((l) => [l.id, l.name]));
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Broadcasts"
        subtitle="Write a fresh email 2-3×/week and send it to a list. Body is markdown and renders through the machine — offer prices, tracked links, and lead-tagging all work. Sunset contacts are skipped automatically."
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Compose</h2>
        <BroadcastComposer lists={lists.map((l) => ({ id: l.id, name: l.name }))} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Scheduled &amp; sent</h2>
        {broadcasts.length === 0 ? (
          <p className="text-[13px] text-slate-400">No broadcasts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4 font-medium">Subject</th>
                  <th className="py-2 pr-4 font-medium">List</th>
                  <th className="py-2 pr-4 font-medium">When (Manila)</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Sent</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((b) => (
                  <tr key={b.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pr-4 text-slate-800">{b.subject}</td>
                    <td className="py-2 pr-4 text-slate-500">{b.listId ? listName.get(b.listId) ?? '—' : '—'}</td>
                    <td className="tnum py-2 pr-4 text-slate-500">{fmt(b.scheduledAt)}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[b.status] ?? 'bg-slate-100 text-slate-500'}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="tnum py-2 pr-4 text-slate-600">
                      {b.status === 'sent' ? `${b.sentCount}/${b.totalCount ?? '?'}` : '—'}
                    </td>
                    <td className="py-2">
                      {b.status === 'scheduled' && (
                        <form action={cancelBroadcastAction}>
                          <input type="hidden" name="id" value={b.id} />
                          <button className="text-[12px] text-slate-400 underline-offset-2 hover:text-red-600 hover:underline">
                            Cancel
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
