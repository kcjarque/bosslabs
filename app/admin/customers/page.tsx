import { requireAdmin } from '@/lib/admin-auth';
import {
  getSignups,
  getEvents,
  getSequences,
  getEmailTemplates,
  getSmsTemplates,
} from '@/lib/db';
import { SignupsTable } from '@/components/SignupsTable';
import { getCloserRecoveredSignupIds } from '@/lib/closers';
import { recoveredIdSet } from '@/lib/recovered';
import {
  bulkSubscribeAction,
  bulkDeleteAction,
  bulkSendAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  requireAdmin();
  const [signups, events, sequences, emailTemplates, smsTemplates, closerRecoveredIds] =
    await Promise.all([
      getSignups(),
      getEvents(),
      getSequences(),
      getEmailTemplates(),
      getSmsTemplates(),
      getCloserRecoveredSignupIds(),
    ]);
  const eventNameById = Object.fromEntries(events.map((e) => [e.id, e.name]));
  // Recovered = abandoned-then-paid OR closer-claimed-then-paid (orange badge).
  const recoveredIds = Array.from(recoveredIdSet(signups, closerRecoveredIds));
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Customers
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {signups.length} {signups.length === 1 ? 'customer' : 'customers'} · click any
            row to view profile + comms history.
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

      <SignupsTable
        initial={signups}
        recoveredIds={recoveredIds}
        eventNameById={eventNameById}
        sequences={sequences}
        emailTemplates={emailTemplates.map((t) => ({ id: t.id, name: t.name }))}
        smsTemplates={smsTemplates.map((t) => ({ id: t.id, name: t.name }))}
        onBulkSubscribe={bulkSubscribeAction}
        onBulkDelete={bulkDeleteAction}
        onBulkSend={bulkSendAction}
      />
    </div>
  );
}
