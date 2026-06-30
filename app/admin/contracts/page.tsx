import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { listContracts, projectedAnnualContractValue, type Contract } from '@/lib/contracts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contracts — Admin' };

function fmtPHP(centavos: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
  }).format(centavos / 100);
}

function statusPill(s: Contract['status']) {
  const map: Record<Contract['status'], string> = {
    draft: 'bg-slate-100 text-slate-600',
    sent: 'bg-amber-100 text-amber-700',
    signed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-rose-100 text-rose-700',
  };
  return `inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${map[s]}`;
}

export default async function ContractsListPage() {
  requireAdmin();
  const contracts = await listContracts({ limit: 200 });

  const totalAnnual = contracts.reduce((s, c) => s + projectedAnnualContractValue(c), 0);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Contracts</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {contracts.length} saved · projected annual value {fmtPHP(totalAnnual)} (one-time + 12 mo retainer)
          </p>
        </div>
        <Link
          href="/admin/contracts/new"
          className="inline-flex items-center gap-2 rounded-full bg-cyan-600 px-5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-cyan-700"
        >
          + New contract
        </Link>
      </header>

      {contracts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-[14px] text-slate-500">No saved contracts yet.</p>
          <Link
            href="/admin/contracts/new"
            className="mt-3 inline-block text-[13px] font-semibold text-cyan-700 hover:underline"
          >
            Create your first one →
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {contracts.map((c) => {
            const annual = projectedAnnualContractValue(c);
            return (
              <Link
                key={c.id}
                href={`/admin/contracts/${c.id}`}
                className="group block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-cyan-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="line-clamp-2 text-[15px] font-semibold text-slate-900 group-hover:text-cyan-700">
                    {c.clientCompanyName || 'Untitled'}
                  </h2>
                  <span className={statusPill(c.status)}>{c.status}</span>
                </div>
                <p className="mt-1 text-[12px] text-slate-500">
                  {c.clientRepName ? `${c.clientRepName} · ` : ''}
                  Effective {c.effectiveDate}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">One-time</div>
                    <div className="font-semibold text-slate-900">{fmtPHP(c.oneTimeTotalCentavos)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Monthly</div>
                    <div className="font-semibold text-slate-900">
                      {c.monthlyTotalCentavos > 0 ? `${fmtPHP(c.monthlyTotalCentavos)}/mo` : '—'}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                  <span>{c.signupId ? '↪ Linked to customer' : 'Not linked'}</span>
                  <span>~{fmtPHP(annual)} / yr</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
