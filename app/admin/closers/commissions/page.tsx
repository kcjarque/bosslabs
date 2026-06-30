import { requireAdmin } from '@/lib/admin-auth';
import { listPendingCommissionsByCloser } from '@/lib/closers';
import { ClosersTabs } from '@/components/ClosersTabs';
import { PayoutButton } from '@/components/closers/PayoutButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Closer commissions · BOSSLABS AI' };

const peso = (c: number) =>
  `₱${(c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function CloserCommissionsPage() {
  requireAdmin();
  const groups = await listPendingCommissionsByCloser();

  const grandTotalCentavos = groups.reduce((s, g) => s + g.totalCentavos, 0);
  const grandCount = groups.reduce((s, g) => s + g.commissions.length, 0);
  const closersWithPending = groups.filter((g) => g.commissions.length > 0).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Commissions
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pending commissions grouped by closer. Click <strong>Pay out</strong> to settle a closer&rsquo;s
          batch — you&rsquo;ll upload the deposit slip and the rows move to{' '}
          <a href="/admin/closers/payouts" className="text-cyan-700 hover:underline">Payout History</a>.
        </p>
      </header>

      <ClosersTabs active="commissions" />

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total pending" value={peso(grandTotalCentavos)} tint="text-amber-700" />
        <Stat label="Commissions" value={String(grandCount)} />
        <Stat label="Closers owed" value={String(closersWithPending)} />
      </div>

      {/* Per-closer groups */}
      <div className="space-y-3">
        {groups.length === 0 && (
          <div className="card text-sm text-slate-500">No closers yet.</div>
        )}
        {groups.map((g) => (
          <div key={g.closer.id} className="card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">{g.closer.name}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                @{g.closer.username}
              </span>
              {!g.closer.active && (
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-600">inactive</span>
              )}
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  {g.commissions.length} pending · {peso(g.totalCentavos)}
                </span>
                {g.commissions.length > 0 && (
                  <PayoutButton
                    closerId={g.closer.id}
                    closerName={g.closer.name}
                    totalCentavos={g.totalCentavos}
                    commissionCount={g.commissions.length}
                  />
                )}
              </span>
            </div>

            {g.commissions.length === 0 ? (
              <p className="mt-3 text-[12px] text-slate-400">No pending commissions for this closer.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-400">
                      <th className="pb-2">Customer</th>
                      <th className="pb-2">Sale</th>
                      <th className="pb-2">Rate</th>
                      <th className="pb-2 text-right">Commission</th>
                      <th className="pb-2 text-right">Closed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.commissions.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className="py-2 font-medium text-slate-800">{c.name}</td>
                        <td className="py-2 text-slate-600">{peso(c.saleCentavos)}</td>
                        <td className="py-2 text-slate-500">{c.percent}%</td>
                        <td className="py-2 text-right font-semibold text-emerald-700">{peso(c.amountCentavos)}</td>
                        <td className="py-2 text-right text-[11px] text-slate-400">
                          {new Date(c.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`bl-private mt-1 text-xl font-semibold ${tint ?? 'text-slate-900'}`}>{value}</div>
    </div>
  );
}
