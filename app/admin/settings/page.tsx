import { requireAdmin } from '@/lib/admin-auth';
import { getSettingsForAdmin, getEvents } from '@/lib/db';
import { SettingsForm } from '@/components/SettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  requireAdmin();
  // Secrets are blanked here before the page is rendered — they never
  // touch the browser's DOM/view-source. Leave a secret field blank in
  // the form to keep the stored value; type a new value to replace it.
  const [settings, events] = await Promise.all([getSettingsForAdmin(), getEvents()]);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Stored encrypted at rest in Supabase. Secret fields below are
          masked — leave blank to keep the current value, or type a new one
          to overwrite. Rotate any key that ever appears in a screenshot.
        </p>
      </header>
      <SettingsForm initial={settings} events={events} />
    </div>
  );
}
