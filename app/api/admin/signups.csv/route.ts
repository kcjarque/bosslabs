import { isAdminLoggedIn } from '@/lib/admin-auth';
import { getSignups } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  if (!isAdminLoggedIn()) {
    return new Response('Unauthorized', { status: 401 });
  }
  const rows = await getSignups();
  const header = [
    'id',
    'firstName',
    'lastName',
    'email',
    'phone',
    'source',
    'status',
    'amountCentavos',
    'bumped',
    'createdAt',
  ];
  const csv = [
    header.join(','),
    ...rows.map((r) =>
      header
        .map((h) => {
          const v = (r as Record<string, unknown>)[h];
          if (v === undefined || v === null) return '';
          return `"${String(v).replace(/"/g, '""')}"`;
        })
        .join(','),
    ),
  ].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bosslabs-signups-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
