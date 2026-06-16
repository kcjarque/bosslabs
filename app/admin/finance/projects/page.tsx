import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { formatPHP } from '@/lib/config';
import { PageHeader } from '@/components/admin/PageHeader';
import { listProjects } from '@/lib/finance';
import { addProjectAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Projects · BOSSLABS AI' };

export default async function FinanceProjectsPage() {
  requireAdmin();
  const projects = await listProjects();

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Budget a project line-by-line (BOM style), then log actual costs against it. Each project's actual is the sum of expenses tagged to it."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {projects.length === 0 ? (
            <div className="card text-center text-sm text-slate-400">
              No projects yet. Create your first one →
            </div>
          ) : (
            projects.map((p) => {
              const variance = p.budgetCentavos - p.actualCentavos;
              const pct = p.budgetCentavos > 0 ? Math.round((p.actualCentavos / p.budgetCentavos) * 100) : 0;
              const over = p.budgetCentavos > 0 && p.actualCentavos > p.budgetCentavos;
              return (
                <Link
                  key={p.id}
                  href={`/admin/finance/projects/${p.id}`}
                  className="card block transition hover:border-cyan-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{p.name}</div>
                      {p.note && <div className="mt-0.5 truncate text-[13px] text-slate-500">{p.note}</div>}
                    </div>
                    <span className={`pill ${over ? 'pill-red' : 'pill-green'}`}>
                      {over ? 'over budget' : `${pct}% spent`}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <Stat label="Budget" value={formatPHP(p.budgetCentavos)} />
                    <Stat label="Actual" value={formatPHP(p.actualCentavos)} tone="red" />
                    <Stat
                      label="Variance"
                      value={`${variance < 0 ? '-' : ''}${formatPHP(Math.abs(variance))}`}
                      tone={variance < 0 ? 'red' : 'green'}
                    />
                  </div>
                  {p.budgetCentavos > 0 && (
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full ${over ? 'bg-red-500' : 'bg-cyan-500'}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  )}
                </Link>
              );
            })
          )}
        </div>

        <form action={addProjectAction} className="card h-fit space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">New project</h3>
          <div>
            <label className="label">Name</label>
            <input name="name" required placeholder="e.g. Office buildout" className="input" />
          </div>
          <div>
            <label className="label">Note (optional)</label>
            <input name="note" placeholder="short description" className="input" />
          </div>
          <button type="submit" className="btn btn-primary w-full">
            Create project
          </button>
        </form>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'red' | 'green';
}) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
