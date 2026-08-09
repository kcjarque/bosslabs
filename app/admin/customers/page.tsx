import { requireAdmin } from '@/lib/admin-auth';
import {
  getSignupsPage,
  getSignupCounts,
  getEvents,
  getSequences,
  getEmailTemplates,
  getSmsTemplates,
  type SignupsPageStatus,
} from '@/lib/db';
import { SignupsTable } from '@/components/SignupsTable';
import { getCloserRecoveredSignupIds, getClaimedByMap } from '@/lib/closers';
import { recoveredIdSet } from '@/lib/recovered';
import { CustomersToolbar } from '@/components/admin/CustomersToolbar';
import { CustomersPagination } from '@/components/admin/CustomersPagination';
import {
  bulkSubscribeAction,
  bulkDeleteAction,
  bulkSendAction,
} from './actions';

export const dynamic = 'force-dynamic';

const STATUSES = new Set<SignupsPageStatus>([
  'all',
  'paid',
  'abandoned',
  'refunded',
  'unsubscribed',
]);

export default async function CustomersPage(
  props: {
    searchParams?: Promise<{
      q?: string;
      status?: string;
      event?: string;
      page?: string;
      size?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  await requireAdmin();
  const q = (searchParams?.q ?? '').trim();
  const status: SignupsPageStatus = STATUSES.has(
    (searchParams?.status ?? 'all') as SignupsPageStatus,
  )
    ? ((searchParams?.status ?? 'all') as SignupsPageStatus)
    : 'all';
  const event = (searchParams?.event ?? '').trim();
  const page = Math.max(1, Number.parseInt(searchParams?.page ?? '1', 10) || 1);
  const size = Math.min(
    200,
    Math.max(10, Number.parseInt(searchParams?.size ?? '50', 10) || 50),
  );

  const [pageData, counts, events, sequences, emailTemplates, smsTemplates, closerRecoveredIds, claimedByMap] =
    await Promise.all([
      getSignupsPage({ q, status, event: event || undefined, page, size }),
      getSignupCounts(),
      getEvents(),
      getSequences(),
      getEmailTemplates(),
      getSmsTemplates(),
      getCloserRecoveredSignupIds(),
      getClaimedByMap(),
    ]);
  const eventNameById = Object.fromEntries(events.map((e) => [e.id, e.name]));
  const claimedByName = Object.fromEntries(claimedByMap);
  // Recovered = abandoned-then-paid OR closer-claimed-then-paid (orange badge).
  const recoveredIds = Array.from(recoveredIdSet(pageData.rows, closerRecoveredIds));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Customers
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Click any row to view profile + comms history.
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

      <CustomersToolbar
        counts={counts}
        events={events.map((e) => ({ id: e.id, name: e.name }))}
        initialQ={q}
        status={status}
        event={event}
      />

      <SignupsTable
        initial={pageData.rows}
        recoveredIds={recoveredIds}
        claimedByName={claimedByName}
        eventNameById={eventNameById}
        sequences={sequences}
        emailTemplates={emailTemplates.map((t) => ({ id: t.id, name: t.name }))}
        smsTemplates={smsTemplates.map((t) => ({ id: t.id, name: t.name }))}
        onBulkSubscribe={bulkSubscribeAction}
        onBulkDelete={bulkDeleteAction}
        onBulkSend={bulkSendAction}
        serverPaginated
      />

      <CustomersPagination
        page={page}
        size={size}
        total={pageData.total}
        rowsOnPage={pageData.rows.length}
      />
    </div>
  );
}
