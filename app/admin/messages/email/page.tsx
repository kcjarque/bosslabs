import { requireAdmin } from '@/lib/admin-auth';
import { PageHeader } from '@/components/admin/PageHeader';
import { MessagesLog, parseRange, rangeWindow } from '@/components/admin/MessagesLog';
import { listSentMessages } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email Logs · BOSSLABS AI' };

export default async function EmailLogsPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  requireAdmin();
  const range = parseRange(searchParams.range);
  const { from, to } = rangeWindow(range);
  const rows = await listSentMessages('email', from, to);

  return (
    <div>
      <PageHeader
        title="Email Logs"
        subtitle="Every email sent, in one place — sequence blasts grouped into one line, confirmations kept one by one. Includes webinar, OTO, and VibeCode Retreat sends."
      />
      <MessagesLog rows={rows} channel="email" range={range} basePath="/admin/messages/email" />
    </div>
  );
}
