import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import { formatPHP } from '@/lib/config';
import { PageHeader } from '@/components/admin/PageHeader';
import { ConfirmButton } from '@/components/finance/ConfirmButton';
import { PaidBySelect } from '@/components/finance/PaidBySelect';
import { getProject, listCategories, listPayers, manilaToday } from '@/lib/finance';
import {
  addProjectItemAction,
  updateProjectItemAction,
  deleteProjectItemAction,
  addProjectExpenseAction,
  deleteExpenseAction,
  deleteProjectAction,
} from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  requireAdmin();
  const [detail, categories, payers] = await Promise.all([
    getProject(params.id),
    listCategories(),
    listPayers(),
  ]);
  if (!detail) notFound();
  const { project, items, expenses } = detail;
  const variance = project.budgetCentavos - project.actualCentavos;
  const over = project.actualCentavos > project.budgetCentavos && project.budgetCentavos > 0;

  return (
    <div>
      <Link href="/admin/finance/projects" className="text-[13px] text-slate-500 hover:text-slate-900">
        ← All projects
      </Link>
      <PageHeader title={project.name} subtitle={project.note || undefined}>
        <form action={deleteProjectAction}>
          <input type="hidden" name="id" value={project.id} />
          <ConfirmButton
            message="Delete this project? Its line items are removed; tagged expenses are kept but untagged."
            className="btn btn-secondary text-red-600"
          >
            Delete project
          </ConfirmButton>
        </form>
      </PageHeader>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Budget" value={formatPHP(project.budgetCentavos)} />
        <Kpi label="Actual" value={formatPHP(project.actualCentavos)} tone="red" />
        <Kpi
          label="Variance"
          value={`${variance < 0 ? '-' : ''}${formatPHP(Math.abs(variance))}`}
          tone={variance < 0 ? 'red' : 'green'}
          hint={over ? 'over budget' : 'remaining'}
        />
      </div>

      {/* BOM line items */}
      <div className="card mt-6 overflow-hidden p-0">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
          Budget
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-semibold">Line item</th>
                <th className="px-4 py-2.5 font-semibold">Budget</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actual</th>
                <th className="px-4 py-2.5 text-right font-semibold">Variance</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No line items yet. Add one below.
                  </td>
                </tr>
              ) : (
                items.map((it) => {
                  const v = it.budgetCentavos - it.actualCentavos;
                  return (
                    <tr key={it.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2">
                        {/* one form per row (holds the id); the name + budget
                            inputs and Save live in their own cells but submit
                            here via the form= attribute, so one Save commits both. */}
                        <form id={`fi_${it.id}`} action={updateProjectItemAction} className="hidden">
                          <input type="hidden" name="id" value={it.id} />
                        </form>
                        <input
                          form={`fi_${it.id}`}
                          name="name"
                          defaultValue={it.name}
                          placeholder="Line item"
                          className="input !w-full !max-w-[240px] !px-2 !py-1 font-medium"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">₱</span>
                          <input
                            form={`fi_${it.id}`}
                            name="budget"
                            inputMode="decimal"
                            defaultValue={(it.budgetCentavos / 100).toString()}
                            className="input !w-24 !px-2 !py-1 tabular-nums"
                          />
                          <button
                            form={`fi_${it.id}`}
                            type="submit"
                            className="text-[12px] text-cyan-700 hover:underline"
                          >
                            Save
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-red-600">
                        {formatPHP(it.actualCentavos)}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-semibold tabular-nums ${
                          v < 0 ? 'text-red-600' : 'text-emerald-600'
                        }`}
                      >
                        {v < 0 ? '-' : ''}
                        {formatPHP(Math.abs(v))}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <form action={deleteProjectItemAction}>
                          <input type="hidden" name="id" value={it.id} />
                          <ConfirmButton
                            message="Delete this line item? Expenses logged to it stay on the project."
                            className="text-[12px] text-slate-400 hover:text-red-600"
                          >
                            Delete
                          </ConfirmButton>
                        </form>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {/* add line item */}
        <form
          action={addProjectItemAction}
          className="flex flex-wrap items-end gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3"
        >
          <input type="hidden" name="projectId" value={project.id} />
          <div className="min-w-[180px] flex-1">
            <label className="label">New line item</label>
            <input name="name" required placeholder="e.g. Signage materials" className="input" />
          </div>
          <div>
            <label className="label">Budget (₱)</label>
            <input name="budget" inputMode="decimal" placeholder="0.00" className="input !w-32" />
          </div>
          <button type="submit" className="btn btn-secondary">
            Add line item
          </button>
        </form>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* project expenses */}
        <div className="card overflow-hidden p-0">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
            Logged expenses ({expenses.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Description</th>
                  <th className="px-4 py-2.5 font-semibold">Line item</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No expenses logged to this project yet.
                    </td>
                  </tr>
                ) : (
                  expenses.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-500">
                        {e.spentOn.slice(8)}/{e.spentOn.slice(5, 7)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{e.description}</td>
                      <td className="px-4 py-2.5">
                        {e.projectItemName ? (
                          <span className="pill pill-green">{e.projectItemName}</span>
                        ) : (
                          <span className="text-[12px] text-slate-400">general</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                        {formatPHP(e.amountCentavos)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <form action={deleteExpenseAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <ConfirmButton
                            message="Delete this expense?"
                            className="text-[12px] text-slate-400 hover:text-red-600"
                          >
                            Delete
                          </ConfirmButton>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* add project expense */}
        <form action={addProjectExpenseAction} className="card h-fit space-y-3">
          <input type="hidden" name="projectId" value={project.id} />
          <h3 className="text-sm font-semibold text-slate-900">Log expense to project</h3>
          <div>
            <label className="label">Description</label>
            <input name="description" required placeholder="e.g. Vinyl print" className="input" />
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
            <label className="label">Line item (optional)</label>
            <select name="projectItemId" className="select" defaultValue="">
              <option value="">— General (no line item) —</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Category (optional)</label>
            <select name="categoryId" className="select" defaultValue="">
              <option value="">— None —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <PaidBySelect
            payers={payers.map((p) => p.name)}
            directLabel="— Business paid directly —"
            help="If someone fronted this, pick who — it's added to Accounts Payable until reimbursed."
          />
          <button type="submit" className="btn btn-primary w-full">
            Add to project
          </button>
        </form>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: 'red' | 'green';
  hint?: string;
}) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums sm:text-2xl ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}
