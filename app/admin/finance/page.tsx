import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { formatPHP } from '@/lib/config';
import { PageHeader } from '@/components/admin/PageHeader';
import { ConfirmButton } from '@/components/finance/ConfirmButton';
import { EditableAmount } from '@/components/finance/EditableAmount';
import {
  getMonthlyConsolidation,
  listCategories,
  manilaToday,
  manilaYearMonth,
  PAYERS,
} from '@/lib/finance';
import {
  addExpenseAction,
  editRowAmountAction,
  deleteRowAction,
  resetRecurringOverrideAction,
} from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Expenses · BOSSLABS AI' };

function parseYm(ym: string | undefined): { year: number; month: number } {
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    return { year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)) };
  }
  return manilaYearMonth();
}
function ymStr(year: number, month: number): string {
  return `${year}-${month < 10 ? '0' : ''}${month}`;
}
function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = (year * 12 + (month - 1)) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}
function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function FinanceExpensesPage({
  searchParams,
}: {
  searchParams: { ym?: string };
}) {
  requireAdmin();
  const { year, month } = parseYm(searchParams.ym);
  const [data, categories] = await Promise.all([
    getMonthlyConsolidation(year, month),
    listCategories(),
  ]);
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const cur = manilaYearMonth();
  const isCurrentMonth = year === cur.year && month === cur.month;

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Every peso out this month — single entries, project costs, and recurring payments folded into one projected total. Recurring items appear automatically on their credit date."
      >
        <Link href={`/admin/finance?ym=${ymStr(prev.year, prev.month)}`} className="btn btn-secondary">
          ← {monthLabel(prev.year, prev.month).split(' ')[0]}
        </Link>
        <span className="px-1 text-sm font-semibold text-slate-700">{monthLabel(year, month)}</span>
        <Link href={`/admin/finance?ym=${ymStr(next.year, next.month)}`} className="btn btn-secondary">
          {monthLabel(next.year, next.month).split(' ')[0]} →
        </Link>
        {!isCurrentMonth && (
          <Link href="/admin/finance" className="btn btn-ghost text-[13px]">
            This month
          </Link>
        )}
      </PageHeader>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Projected this month" value={formatPHP(data.projectedFullCentavos)} tone="slate" />
        <Kpi label="Spent to date" value={formatPHP(data.actualToDateCentavos)} tone="red" />
        <Kpi label="Recurring load" value={formatPHP(data.bySource.recurring)} tone="cyan" />
        <Kpi label="Entries" value={String(data.rows.length)} tone="slate" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Consolidated table */}
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Description</th>
                  <th className="px-4 py-2.5 font-semibold">Tag</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                      No expenses yet for {monthLabel(year, month)}. Add one →
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <tr key={r.key} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-500">
                        {r.date.slice(8)}/{r.date.slice(5, 7)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        {r.description}
                        {!r.credited && (
                          <span className="pill pill-amber ml-2">upcoming</span>
                        )}
                        {r.isAbono && (
                          <span className={`pill ml-2 ${r.abonoSettled ? 'pill-green' : 'pill-cyan'}`}>
                            abono{r.paidBy ? ` · ${r.paidBy}` : ''}{r.abonoSettled ? ' · paid' : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`pill ${
                            r.source === 'recurring'
                              ? 'pill-cyan'
                              : r.source === 'project'
                                ? 'pill-green'
                                : ''
                          }`}
                        >
                          {r.tag}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <EditableAmount
                          display={formatPHP(r.amountCentavos)}
                          amountCentavos={r.amountCentavos}
                          action={editRowAmountAction}
                          fields={
                            r.expenseId
                              ? { expenseId: r.expenseId }
                              : { recurringId: r.recurringId ?? '', date: r.date }
                          }
                        />
                        {r.overridden && <span className="pill pill-amber ml-1.5">edited</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {r.overridden && (
                            <form action={resetRecurringOverrideAction}>
                              <input type="hidden" name="recurringId" value={r.recurringId ?? ''} />
                              <input type="hidden" name="date" value={r.date} />
                              <button
                                type="submit"
                                title="Revert to the default recurring amount"
                                className="text-[12px] text-slate-400 hover:text-cyan-700"
                              >
                                Reset
                              </button>
                            </form>
                          )}
                          <form action={deleteRowAction}>
                            {r.expenseId ? (
                              <input type="hidden" name="expenseId" value={r.expenseId} />
                            ) : (
                              <>
                                <input type="hidden" name="recurringId" value={r.recurringId ?? ''} />
                                <input type="hidden" name="date" value={r.date} />
                              </>
                            )}
                            <ConfirmButton
                              message={
                                r.expenseId
                                  ? 'Delete this expense?'
                                  : 'Remove this recurring charge for this month only?'
                              }
                              className="text-[12px] text-slate-400 hover:text-red-600"
                            >
                              Delete
                            </ConfirmButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right rail: add form + breakdown */}
        <div className="space-y-6">
          <form action={addExpenseAction} className="card space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Add single expense</h3>
            <div>
              <label className="label">Description</label>
              <input name="description" required placeholder="e.g. Canva Pro" className="input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Amount (₱)</label>
                <input name="amount" required inputMode="decimal" placeholder="0.00" className="input" />
              </div>
              <div>
                <label className="label">Date</label>
                <input type="date" name="spentOn" defaultValue={manilaToday()} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Category</label>
              <select name="categoryId" className="select" defaultValue="">
                <option value="">— Uncategorized —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" name="isAbono" value="1" className="h-4 w-4 accent-cyan-600" />
                Abono — someone fronted this (reimbursable)
              </label>
              <div className="mt-3">
                <label className="label">Paid by (optional)</label>
                <select name="paidBy" className="select" defaultValue="">
                  <option value="">—</option>
                  {PAYERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                Marking an abono adds it to Accounts Payable until you reimburse the person.
              </p>
            </div>
            <button type="submit" className="btn btn-primary w-full">
              Add expense
            </button>
          </form>

          <div className="card">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">This month by category</h3>
            {data.byCategory.length === 0 ? (
              <p className="text-[13px] text-slate-400">Nothing yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.byCategory.map((c) => (
                  <li key={c.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{c.name}</span>
                    <span className="font-medium tabular-nums text-slate-900">
                      {formatPHP(c.centavos)}
                    </span>
                  </li>
                ))}
                <li className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
                  <span>Projected total</span>
                  <span className="tabular-nums">{formatPHP(data.projectedFullCentavos)}</span>
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'red' | 'cyan';
}) {
  const color =
    tone === 'red' ? 'text-red-600' : tone === 'cyan' ? 'text-cyan-700' : 'text-slate-900';
  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${color}`}>{value}</div>
    </div>
  );
}
