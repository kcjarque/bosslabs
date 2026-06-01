import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { listClosers } from '@/lib/closers';
import { CloserManager } from '@/components/CloserManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Closers · BOSSLABS AI' };

export default async function ClosersAdminPage() {
  requireAdmin();
  const closers = await listClosers();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Sales closers
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage the closer accounts that log in at{' '}
          <Link href="/closer" target="_blank" className="text-cyan-600 hover:underline">/closer</Link>{' '}
          to work abandoned-cart leads. Set their password and commission rate here.
        </p>
      </header>

      <CloserManager closers={closers} />
    </div>
  );
}
