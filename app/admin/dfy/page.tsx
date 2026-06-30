import { requireAdmin } from '@/lib/admin-auth';
import { listProjects } from '@/lib/dfy';
import { DfyKanban } from '@/components/admin/dfy/DfyKanban';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'DFY Ops — Admin' };

export default async function DfyKanbanPage() {
  requireAdmin();
  const projects = await listProjects();

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">DFY Ops</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Every Done-For-You engagement, lane by lane. Click a card for vision, files, and DevOps.
        </p>
      </header>

      <DfyKanban initial={projects} />
    </div>
  );
}
