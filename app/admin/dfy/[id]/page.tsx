import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { getProject, listComments, listFiles } from '@/lib/dfy';
import { getSignupById } from '@/lib/db';
import { DfyVisionPanel } from '@/components/admin/dfy/DfyVisionPanel';
import { DfyFilesPanel } from '@/components/admin/dfy/DfyFilesPanel';
import { DfyDevOpsPanel } from '@/components/admin/dfy/DfyDevOpsPanel';
import { DfyDetailHeader } from '@/components/admin/dfy/DfyDetailHeader';
import { DfyTabSwitcher } from '@/components/admin/dfy/DfyTabSwitcher';
import type { LinkedCustomer } from '@/components/admin/CustomerLinkPicker';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const p = await getProject(params.id);
  return { title: p ? `${p.customerName} — DFY` : 'DFY — Admin' };
}

export default async function DfyDetailPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ tab?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  await requireAdmin();
  const project = await getProject(params.id);
  if (!project) return notFound();

  const [signup, files, comments] = await Promise.all([
    project.signupId ? getSignupById(project.signupId) : Promise.resolve(null),
    listFiles(project.id),
    listComments(project.id),
  ]);

  const initialLinked: LinkedCustomer | null = signup
    ? {
        signupId: signup.id,
        email: signup.email,
        firstName: signup.firstName ?? '',
        lastName: signup.lastName ?? '',
        status: signup.status ?? '',
      }
    : null;

  const tab = searchParams.tab === 'files' || searchParams.tab === 'devops' ? searchParams.tab : 'vision';

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* Top breadcrumb */}
      <div className="text-[12px]">
        <Link href="/admin/dfy" className="text-slate-500 hover:text-cyan-700 hover:underline">
          ← All projects
        </Link>
      </div>

      <DfyDetailHeader project={project} />
      <DfyTabSwitcher activeTab={tab} projectId={project.id} />

      {tab === 'vision' && (
        <DfyVisionPanel project={project} signup={signup} initialLinked={initialLinked} />
      )}
      {tab === 'files' && <DfyFilesPanel projectId={project.id} initial={files} />}
      {tab === 'devops' && <DfyDevOpsPanel project={project} initialComments={comments} />}
    </div>
  );
}
