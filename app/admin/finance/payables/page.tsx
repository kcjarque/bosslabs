import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { formatPHP } from '@/lib/config';
import { PageHeader } from '@/components/admin/PageHeader';
import { listAccountsPayable } from '@/lib/finance';
import { settleAbonoAction, unsettleAbonoAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Accounts Payable · BOSSLABS AI' };

export default async function PayablesPage() {
  requireAdmin();
  const ap = await listAccountsPayable();

  return (
    <div>
      <PageHeader
        title="Accounts Payable"
        subtitle="Money the business owes for expenses someone fronted (a 'Paid by' was set). Mark an item PAID when you reimburse the person — the total drops. Reimbursing doesn't change the original expense."
      />

      {/* Per-person totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="card border-cyan-200 bg-cyan-50/50">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Total owed</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-cyan-700 sm:text-2xl">
            {formatPHP(ap.totalCentavos)}
          </div>
        </div>
        {ap.byPayer.map((p) => (
          <div key={p.payer} className="card">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">{p.payer}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900 sm:text-2xl">
              {formatPHP(p.centavos)}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              {p.count} item{p.count === 1 ? '' : 's'}
            </div>
          </div>
        ))}
      </div>

      {/* Open payables */}
      <h2 className="mb-2 mt-8 text-lg font-semibold text-slate-900">Open</h2>
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Description</th>
                <th className="px-4 py-2.5 font-semibold">Paid by</th>
                <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {ap.open.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    Nothing owed right now. Set a "Paid by" person on an expense in the{' '}
                    <Link href="/admin/finance" className="text-cyan-700 hover:underline">
                      Expenses
                    </Link>{' '}
                    tab and it shows up here.
                  </td>
                </tr>
              ) : (
                ap.open.map((it) => (
                  <tr key={it.key} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-500">
                      {it.date.slice(8)}/{it.date.slice(5, 7)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {it.description}
                      {it.kind === 'recurring' && <span className="pill ml-2">recurring</span>}
                      {it.projectName && (
                        <span className="pill pill-green ml-2">{it.projectName}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="pill pill-cyan">{it.paidBy}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                      {formatPHP(it.amountCentavos)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <form action={settleAbonoAction}>
                        <input type="hidden" name="kind" value={it.kind} />
                        {it.kind === 'recurring' ? (
                          <>
                            <input type="hidden" name="recurringId" value={it.recurringId ?? ''} />
                            <input type="hidden" name="date" value={it.date} />
                          </>
                        ) : (
                          <input type="hidden" name="expenseId" value={it.expenseId ?? ''} />
                        )}
                        <button type="submit" className="btn btn-secondary !px-3 !py-1 text-[12px]">
                          Mark PAID
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settled history (backtrack / undo) */}
      {ap.settled.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-lg font-semibold text-slate-900">
            Settled ({ap.settled.length})
          </h2>
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {ap.settled.map((it) => (
                    <tr key={it.key} className="border-b border-slate-100 text-slate-500 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                        {it.date.slice(8)}/{it.date.slice(5, 7)}
                      </td>
                      <td className="px-4 py-2">
                        {it.description}
                        {it.kind === 'recurring' && <span className="pill ml-2">recurring</span>}
                      </td>
                      <td className="px-4 py-2">
                        <span className="pill">{it.paidBy}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums line-through">
                        {formatPHP(it.amountCentavos)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <form action={unsettleAbonoAction}>
                          <input type="hidden" name="kind" value={it.kind} />
                          {it.kind === 'recurring' ? (
                            <>
                              <input type="hidden" name="recurringId" value={it.recurringId ?? ''} />
                              <input type="hidden" name="date" value={it.date} />
                            </>
                          ) : (
                            <input type="hidden" name="expenseId" value={it.expenseId ?? ''} />
                          )}
                          <button
                            type="submit"
                            className="text-[12px] text-slate-400 hover:text-cyan-700"
                          >
                            Undo
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
