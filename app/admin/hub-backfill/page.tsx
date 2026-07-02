import { requireAdmin } from '@/lib/admin-auth';
import { HubBackfillRunner } from '@/components/admin/HubBackfillRunner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hub backfill — Admin' };

export default function HubBackfillPage() {
  requireAdmin();
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Hub backfill</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Provision + email BossLabs Hub credentials to Vault buyers whose payment
          webhook missed it.
        </p>
      </header>
      <HubBackfillRunner />
    </div>
  );
}
