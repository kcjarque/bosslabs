import { requireAdmin } from '@/lib/admin-auth';
import { getSignups } from '@/lib/db';
import { SignupsTable } from '@/components/SignupsTable';

export const dynamic = 'force-dynamic';

export default async function SignupsPage() {
  requireAdmin();
  const signups = await getSignups();
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Signups
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {signups.length} {signups.length === 1 ? 'record' : 'records'} · click any
            row to send a templated email or SMS.
          </p>
        </div>
        <a
          href="/api/admin/signups.csv"
          className="btn btn-secondary self-start sm:self-auto"
          download
        >
          Export CSV
        </a>
      </header>

      <SignupsTable initial={signups} />
    </div>
  );
}
