import { requireAdmin } from '@/lib/admin-auth';
import { PageHeader } from '@/components/admin/PageHeader';
import { MessagesLog, parseRange, rangeWindow } from '@/components/admin/MessagesLog';
import { listSentMessages } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'SMS Logs · BOSSLABS AI' };

export default async function SmsLogsPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  requireAdmin();
  const range = parseRange(searchParams.range);
  const { from, to } = rangeWindow(range);
  const rows = await listSentMessages('sms', from, to);

  return (
    <div>
      <PageHeader
        title="SMS Logs"
        subtitle="Every text sent, in one place — sequence blasts grouped into one line, confirmations kept one by one."
      />
      <MessagesLog rows={rows} channel="sms" range={range} basePath="/admin/messages/sms" />
    </div>
  );
}
