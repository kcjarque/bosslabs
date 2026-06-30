import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { listNdas, type Nda } from '@/lib/ndas';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'NDAs — Admin' };

function statusPill(s: Nda['status']) {
  const map: Record<Nda['status'], string> = {
    draft: 'bg-slate-100 text-slate-600',
    sent: 'bg-amber-100 text-amber-700',
    signed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-rose-100 text-rose-700',
  };
  return `inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${map[s]}`;
}

export default async function NdasListPage() {
  requireAdmin();
  const ndas = await listNdas({ limit: 200 });

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">NDAs</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {ndas.length} saved mutual non-disclosure agreement{ndas.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href="/admin/ndas/new"
          className="inline-flex items-center gap-2 rounded-full bg-cyan-600 px-5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-cyan-700"
        >
          + New NDA
        </Link>
      </header>

      {ndas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-[14px] text-slate-500">No saved NDAs yet.</p>
          <Link
            href="/admin/ndas/new"
            className="mt-3 inline-block text-[13px] font-semibold text-cyan-700 hover:underline"
          >
            Create your first one →
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ndas.map((n) => (
            <Link
              key={n.id}
              href={`/admin/ndas/${n.id}`}
              className="group block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-cyan-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="line-clamp-2 text-[15px] font-semibold text-slate-900 group-hover:text-cyan-700">
                  {n.counterpartyCompanyName || 'Untitled'}
                </h2>
                <span className={statusPill(n.status)}>{n.status}</span>
              </div>
              <p className="mt-1 text-[12px] text-slate-500">
                {n.counterpartyRepName ? `${n.counterpartyRepName} · ` : ''}
                Effective {n.effectiveDate}
              </p>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                <span>{n.signupId ? '↪ Linked to customer' : 'Not linked'}</span>
                <span>{n.governingVenue}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
