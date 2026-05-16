import { requireAdmin } from '@/lib/admin-auth';
import { getSettings } from '@/lib/db';
import { SettingsForm } from '@/components/SettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  requireAdmin();
  const settings = await getSettings();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Tokens are stored in <code>data/settings.json</code> on the server. Never
          commit this file. Rotate any key that ever appears in a screenshot.
        </p>
      </header>
      <SettingsForm initial={settings} />
    </div>
  );
}
