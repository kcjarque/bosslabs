import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import { getFunnel } from '@/lib/db';
import { FunnelEditor } from '@/components/FunnelEditor';
import { updateFunnelAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function FunnelDetailPage({
  params,
}: {
  params: { id: string };
}) {
  requireAdmin();
  const funnel = await getFunnel(params.id);
  if (!funnel) notFound();

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/funnels" className="text-xs text-slate-500 hover:underline">
          ← All funnels
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {funnel.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          <span className="font-mono">{funnel.slug}</span> · {funnel.kind}
        </p>
      </header>

      {funnel.kind === 'webinar' ? (
        <div className="card">
          <p className="text-sm text-slate-600">
            The webinar funnel&rsquo;s live settings (name, date, time, Zoom
            join + register URLs, replay + Messenger links) are wired into the
            public site and every email template. Edit them in{' '}
            <Link href="/admin/settings" className="font-medium text-cyan-700 hover:underline">
              Settings → Webinar
            </Link>
            .
          </p>
        </div>
      ) : (
        <FunnelEditor funnel={funnel} onSave={updateFunnelAction} />
      )}
    </div>
  );
}
