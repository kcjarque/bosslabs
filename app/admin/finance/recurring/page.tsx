import { requireAdmin } from '@/lib/admin-auth';
import { formatPHP } from '@/lib/config';
import { PageHeader } from '@/components/admin/PageHeader';
import { ConfirmButton } from '@/components/finance/ConfirmButton';
import { listRecurring, listCategories, PAYERS } from '@/lib/finance';
import {
  addRecurringAction,
  setRecurringActiveAction,
  deleteRecurringAction,
} from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Recurring · BOSSLABS AI' };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default async function FinanceRecurringPage() {
  requireAdmin();
  const [items, categories] = await Promise.all([listRecurring(), listCategories()]);
  const monthlyTotal = items
    .filter((r) => r.active)
    .reduce((s, r) => s + r.monthlyEquivalentCentavos, 0);

  return (
    <div>
      <PageHeader
        title="Recurring payments"
        subtitle="Subscriptions, salaries, and other repeating costs. Each one auto-appears in Expenses on its credit date — no re-entry."
      >
        <div className="card !px-4 !py-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Monthly load </span>
          <span className="ml-1 font-semibold tabular-nums text-cyan-700">{formatPHP(monthlyTotal)}</span>
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Category</th>
                  <th className="px-4 py-2.5 font-semibold">Schedule</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-4 py-2.5 text-right font-semibold">/mo</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                      No recurring payments yet. Add one →
                    </td>
                  </tr>
                ) : (
                  items.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b border-slate-100 last:border-0 ${r.active ? '' : 'opacity-50'}`}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        {r.name}
                        {r.isAbono && (
                          <span className="pill pill-cyan ml-2">
                            abono{r.paidBy ? ` · ${r.paidBy}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="pill">{r.categoryName}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {r.cadence === 'weekly'
                          ? `Weekly · ${WEEKDAYS[r.creditDay] ?? 'Mon'}`
                          : `Monthly · ${ordinal(r.creditDay)}`}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                        {formatPHP(r.amountCentavos)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-500">
                        {formatPHP(r.monthlyEquivalentCentavos)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <form action={setRecurringActiveAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="active" value={r.active ? '0' : '1'} />
                            <button type="submit" className="text-[12px] text-slate-400 hover:text-slate-900">
                              {r.active ? 'Pause' : 'Resume'}
                            </button>
                          </form>
                          <form action={deleteRecurringAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <ConfirmButton
                              message="Delete this recurring payment?"
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

        <form action={addRecurringAction} className="card h-fit space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Add recurring payment</h3>
          <div>
            <label className="label">Name</label>
            <input name="name" required placeholder="e.g. Office rent" className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount (₱)</label>
              <input name="amount" required inputMode="decimal" placeholder="0.00" className="input" />
            </div>
            <div>
              <label className="label">Category</label>
              <select name="categoryId" className="select" defaultValue="">
                <option value="">— None —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Cadence</label>
              <select name="cadence" className="select" defaultValue="monthly">
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div>
              <label className="label">Credit day</label>
              <input
                name="creditDay"
                inputMode="numeric"
                defaultValue="1"
                placeholder="1-31, or 0-6 weekly"
                className="input"
              />
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Monthly: day of month (1–31). Weekly: weekday number — 0 = Sunday … 6 = Saturday.
          </p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" name="isAbono" value="1" className="h-4 w-4 accent-cyan-600" />
              Abono — someone fronts this each time
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
              Each due occurrence is added to Accounts Payable until you reimburse the person.
            </p>
          </div>
          <button type="submit" className="btn btn-primary w-full">
            Add recurring
          </button>
        </form>
      </div>
    </div>
  );
}
