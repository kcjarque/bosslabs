import { redirect } from 'next/navigation';
import { requireAdmin, getAdminSession } from '@/lib/admin-auth';
import { listPendingReimbursementsByStaff } from '@/lib/reimbursements';
import { ReimbursementsTabs } from '@/components/ReimbursementsTabs';
import { ReimbursementPayoutButton } from '@/components/reimbursements/ReimbursementPayoutButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reimbursements payable · BOSSLABS AI' };

const peso = (c: number) =>
  `₱${(c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CATEGORY_LABEL: Record<string, string> = {
  transport: 'Transport',
  meals: 'Meals',
  supplies: 'Supplies',
  other: 'Other',
};

function payoutMethodLine(settings: { payoutMethod: 'bank' | 'gcash' | null; bankName: string; bankAccountName: string; bankAccountNumber: string; gcashName: string; gcashNumber: string } | null): string {
  if (!settings?.payoutMethod) return 'No payout method on file';
  if (settings.payoutMethod === 'gcash') return `GCash · ${settings.gcashName} · ${settings.gcashNumber}`;
  return `${settings.bankName} · ${settings.bankAccountName} · ${settings.bankAccountNumber}`;
}

export default async function ReimbursementsPayablePage() {
  await requireAdmin();
  const session = await getAdminSession();
  // Staff (even ones granted no special perms) always land back on their own
  // requests — paying people out is an admin-only action.
  if (!session || session.role !== 'admin') {
    redirect('/admin/reimbursements');
  }

  const groups = await listPendingReimbursementsByStaff();

  const grandTotalCentavos = groups.reduce((s, g) => s + g.totalCentavos, 0);
  const grandCount = groups.reduce((s, g) => s + g.requests.length, 0);
  const staffWithPending = groups.filter((g) => g.requests.length > 0).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Reimbursements
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pending claims grouped by staff member. Click <strong>Pay out</strong> to settle a batch — you&rsquo;ll
          upload the payment slip and the rows move to{' '}
          <a href="/admin/reimbursements/payouts" className="text-cyan-700 hover:underline">Payout History</a>.
        </p>
      </header>

      <ReimbursementsTabs active="payable" role="admin" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total pending" value={peso(grandTotalCentavos)} tint="text-amber-700" />
        <Stat label="Claims" value={String(grandCount)} />
        <Stat label="Staff owed" value={String(staffWithPending)} />
      </div>

      <div className="space-y-3">
        {groups.length === 0 && (
          <div className="card text-sm text-slate-500">No pending reimbursements.</div>
        )}
        {groups.map((g) => (
          <div key={g.staffId} className="card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">{g.staffName}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  g.payoutSettings ? 'bg-slate-100 text-slate-600' : 'bg-rose-50 text-rose-600'
                }`}
              >
                {payoutMethodLine(g.payoutSettings)}
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  {g.requests.length} pending · {peso(g.totalCentavos)}
                </span>
                {g.requests.length > 0 && (
                  <ReimbursementPayoutButton
                    staffId={g.staffId}
                    staffName={g.staffName}
                    totalCentavos={g.totalCentavos}
                    requestCount={g.requests.length}
                  />
                )}
              </span>
            </div>

            {g.requests.length === 0 ? (
              <p className="mt-3 text-[12px] text-slate-400">No pending reimbursements for this staff member.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-400">
                      <th className="pb-2">Description</th>
                      <th className="pb-2">Category</th>
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Receipt</th>
                      <th className="pb-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.requests.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="py-2 font-medium text-slate-800">{r.description}</td>
                        <td className="py-2 text-slate-600">{CATEGORY_LABEL[r.category]}</td>
                        <td className="py-2 text-[11px] text-slate-400">
                          {new Date(r.spentOn).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
                        </td>
                        <td className="py-2">
                          {r.receiptUrl ? (
                            <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-700 hover:underline">
                              View
                            </a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2 text-right font-semibold text-emerald-700">{peso(r.amountCentavos)}</td>
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
