import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { listClosers } from '@/lib/closers';
import { getSettings } from '@/lib/db';
import { CloserManager } from '@/components/CloserManager';
import { CloserSettingsForm } from '@/components/CloserSettingsForm';
import { ClosersTabs } from '@/components/ClosersTabs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Closer settings · BOSSLABS AI' };

export default async function CloserSettingsPage() {
  requireAdmin();
  const [closers, settings] = await Promise.all([listClosers(), getSettings()]);

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

      <ClosersTabs active="settings" />

      <CloserSettingsForm
        initialHours={settings.closerClaimHoldHours}
        initialWorkStart={settings.closerWorkStartHour}
        initialWorkEnd={settings.closerWorkEndHour}
      />

      <CloserManager closers={closers} />
    </div>
  );
}
