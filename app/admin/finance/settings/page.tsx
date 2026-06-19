import { requireAdmin } from '@/lib/admin-auth';
import { PageHeader } from '@/components/admin/PageHeader';
import { ConfirmButton } from '@/components/finance/ConfirmButton';
import { listCategories, listPayers } from '@/lib/finance';
import {
  addCategoryAction,
  deleteCategoryAction,
  addPayerAction,
  deletePayerAction,
} from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Finance settings · BOSSLABS AI' };

export default async function FinanceSettingsPage() {
  requireAdmin();
  const [categories, payers] = await Promise.all([listCategories(), listPayers()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance settings"
        subtitle="Expense categories and the people who can front (Paid by) — used across single expenses, projects, and recurring payments."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="card">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Categories ({categories.length})</h3>
          {categories.length === 0 ? (
            <p className="text-[13px] text-slate-400">No categories yet. Add one →</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-medium text-slate-800">{c.name}</span>
                  <form action={deleteCategoryAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmButton
                      message={`Delete "${c.name}"? Past expenses keep their amount but show as Uncategorized.`}
                      className="text-[12px] text-slate-400 hover:text-red-600"
                    >
                      Delete
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form action={addCategoryAction} className="card h-fit space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Add category</h3>
          <div>
            <label className="label">Name</label>
            <input name="name" required placeholder="e.g. Utilities" className="input" />
          </div>
          <button type="submit" className="btn btn-primary w-full">
            Add category
          </button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="card">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">People — Paid by ({payers.length})</h3>
          <p className="mb-3 text-[12px] text-slate-400">
            Anyone who fronts an expense. New people you add in an expense form show up here too.
          </p>
          {payers.length === 0 ? (
            <p className="text-[13px] text-slate-400">No people yet. Add one →</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {payers.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-medium text-slate-800">{p.name}</span>
                  <form action={deletePayerAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <ConfirmButton
                      message={`Remove "${p.name}" from the Paid-by list? Past expenses they fronted keep their record.`}
                      className="text-[12px] text-slate-400 hover:text-red-600"
                    >
                      Delete
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form action={addPayerAction} className="card h-fit space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Add person</h3>
          <div>
            <label className="label">Name</label>
            <input name="name" required placeholder="e.g. Anna" className="input" />
          </div>
          <button type="submit" className="btn btn-primary w-full">
            Add person
          </button>
        </form>
      </div>
    </div>
  );
}
