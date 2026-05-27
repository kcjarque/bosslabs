import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import {
  getList,
  getEvents,
  computeListMembers,
  type ListFilterType,
} from '@/lib/db';
import { EventPill } from '@/components/EventPill';

export const dynamic = 'force-dynamic';

const FILTER_LABELS: Record<ListFilterType, string> = {
  all_registered: 'All Webinar Attendees',
  all_paid: 'Paid only',
  all_free: 'Free signups',
  abandoned: 'Abandoned checkouts',
  all_signups: 'Everyone',
};

export default async function ListMembersPage({
  params,
}: {
  params: { id: string };
}) {
  requireAdmin();

  const [list, events] = await Promise.all([getList(params.id), getEvents()]);
  if (!list) notFound();

  const members = await computeListMembers(list);
  const eventName = list.eventId
    ? (events.find((e) => e.id === list.eventId)?.name ?? null)
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/admin/lists" className="text-xs text-slate-500 hover:underline">
          ← All lists
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {list.name}
          </h1>
          {eventName && <EventPill name={eventName} />}
        </div>
        {list.description && (
          <p className="text-sm text-slate-500">{list.description}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1">
          {list.filterTypes.map((ft) => (
            <span key={ft} className="pill pill-cyan">
              {FILTER_LABELS[ft] ?? ft}
            </span>
          ))}
        </div>
      </header>

      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Members ({members.length})
          </h2>
          <p className="text-xs text-slate-500">
            Computed live from the current signups table
          </p>
        </div>

        {members.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">
            No customers currently match this list's filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr
                    key={m.id}
                    className="cursor-pointer transition hover:bg-slate-50"
                  >
                    <td>
                      <Link
                        href={`/admin/customers/${m.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {m.firstName} {m.lastName ?? ''}
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={`/admin/customers/${m.id}`}
                        className="text-slate-600 hover:underline"
                      >
                        {m.email}
                      </Link>
                    </td>
                    <td className="text-slate-500">{m.phone || '—'}</td>
                    <td>
                      <span
                        className={
                          m.status === 'paid' || m.status === 'attended'
                            ? 'pill pill-green'
                            : m.status === 'registered'
                              ? 'pill pill-amber'
                              : 'pill'
                        }
                      >
                        {m.status === 'registered' ? 'Abandoned' : m.status}
                      </span>
                    </td>
                    <td className="tabular-nums text-slate-700">
                      {m.amountCentavos != null
                        ? `₱${(m.amountCentavos / 100).toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/admin/customers/${m.id}`}
                        className="text-slate-400 hover:text-slate-900"
                      >
                        →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
