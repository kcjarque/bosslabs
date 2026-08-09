import { isAdminLoggedIn } from '@/lib/admin-auth';
import { getAllSurveyResponsesForExport } from '@/lib/machine-stats';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdminLoggedIn())) {
    return new Response('Unauthorized', { status: 401 });
  }
  const rows = await getAllSurveyResponsesForExport();
  const header = [
    'name',
    'email',
    'event',
    'industry',
    'painPoint',
    'painFreetext',
    'ideaFreetext',
    'intent',
    'createdAt',
  ];
  const csv = [
    header.join(','),
    ...rows.map((r) =>
      [
        r.name,
        r.email,
        r.eventName,
        r.industryLabel,
        r.painLabel,
        r.painFreetext,
        r.ideaFreetext,
        r.intentLabel,
        r.createdAt,
      ]
        .map((v) => {
          if (v === undefined || v === null) return '';
          return `"${String(v).replace(/"/g, '""')}"`;
        })
        .join(','),
    ),
  ].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bosslabs-survey-responses-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
