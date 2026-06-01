import { requireCloser } from '@/lib/closer-auth';
import { listCloserCommissions } from '@/lib/closers';

export const dynamic = 'force-dynamic';

const peso = (c: number) => `₱${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function CloserCommissionsPage() {
  const closer = await requireCloser();
  const rows = await listCloserCommissions(closer.id);

  const total = rows.reduce((s, r) => s + r.amountCentavos, 0);
  const pending = rows.filter((r) => r.status === 'pending').reduce((s, r) => s + r.amountCentavos, 0);
  const paid = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amountCentavos, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Commissions</h1>
        <p className="mt-1 text-sm text-slate-500">
          {closer.commissionPercent}% of everything you close. A row is added automatically when a
          customer you claimed pays.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total earned" value={peso(total)} />
        <Stat label="Pending" value={peso(pending)} tint="text-amber-600" />
        <Stat label="Paid out" value={peso(paid)} tint="text-emerald-600" />
      </div>

      <div className="card">
        <h2 className="text-base font-semibold text-slate-900">History</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No commissions yet. Close a lead and it shows up here.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="pb-2">Customer</th>
                  <th className="pb-2">Sale</th>
                  <th className="pb-2">Rate</th>
                  <th className="pb-2">Commission</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-2 font-medium text-slate-800">{r.name}</td>
                    <td className="py-2 text-slate-600">{peso(r.saleCentavos)}</td>
                    <td className="py-2 text-slate-500">{r.percent}%</td>
                    <td className="py-2 font-semibold text-emerald-700">{peso(r.amountCentavos)}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          r.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-700'
                            : r.status === 'void'
                              ? 'bg-slate-100 text-slate-500'
                              : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 text-[11px] text-slate-400">
                      {new Date(r.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
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

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tint ?? 'text-slate-900'}`}>{value}</div>
    </div>
  );
}
