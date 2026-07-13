import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { PageHeader } from '@/components/admin/PageHeader';
import { listClickEvents } from '@/lib/machine-stats';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Who clicked · The Machine · BOSSLABS AI' };

// Friendly names for the link tags (offers + static targets). Falls back to the
// raw tag for anything not listed.
const TAG_LABEL: Record<string, string> = {
  retreat: 'VibeCode Retreat',
  dfy: 'Done-For-You',
  vault: 'AI Vault',
  oto_1on1: '1:1 Executive Session',
  survey: 'Survey',
  webinar: 'Webinar',
  systems: 'Systems',
  replay: 'Replay',
  community: 'Community',
  review: 'Reviews',
  freebie: 'Free training',
};

function fmtManila(ts: string): string {
  return new Date(ts).toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default async function ClickDrilldownPage({
  searchParams,
}: {
  searchParams: { tag?: string };
}) {
  requireAdmin();
  const tag = (searchParams.tag || '').trim() || null;
  const events = await listClickEvents(tag);
  const people = new Set(events.map((e) => e.contactId).filter(Boolean)).size;
  const label = tag ? TAG_LABEL[tag] ?? tag : null;

  return (
    <div className="space-y-5">
      <Link href="/admin/machine" className="inline-block text-[13px] text-cyan-700 hover:underline">
        ← Back to The Machine
      </Link>

      <PageHeader
        title={label ? `Who clicked “${label}”` : 'All offer-link clicks'}
        subtitle={`${events.length} click${events.length === 1 ? '' : 's'} from ${people} ${
          people === 1 ? 'person' : 'people'
        } — who tapped, exactly when, on which channel. All time, newest first.`}
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {events.length === 0 ? (
          <p className="p-8 text-center text-[13.5px] text-slate-400">
            No clicks on {label ? `“${label}”` : 'any offer link'} yet — they appear here the moment a
            tagged link is tapped.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">Person</th>
                  <th className="px-4 py-2.5 font-semibold">Clicked</th>
                  <th className="px-4 py-2.5 font-semibold">From email</th>
                  <th className="px-4 py-2.5 font-semibold">Channel</th>
                  <th className="px-4 py-2.5 font-semibold">Exact time (Manila)</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr
                    key={`${e.contactId ?? 'x'}-${e.createdAt}-${i}`}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                  >
                    <td className="px-4 py-2.5">
                      {e.contactId ? (
                        <Link
                          href={`/admin/customers/${e.contactId}`}
                          className="font-medium text-cyan-700 hover:underline"
                        >
                          {e.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-700">{e.name}</span>
                      )}
                      {(e.email || e.phone) && (
                        <div className="text-[11.5px] text-slate-400">{e.email || e.phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11.5px] text-slate-700">
                        {e.linkTag}
                      </code>
                      {!tag && TAG_LABEL[e.linkTag] && (
                        <span className="ml-2 text-[12px] text-slate-500">{TAG_LABEL[e.linkTag]}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {e.templateName ? (
                        <span title={e.templateKey ?? undefined}>{e.templateName}</span>
                      ) : (
                        <span className="text-slate-300" title="Clicked before source-email tracking, or an SMS link">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${
                          e.channel === 'email'
                            ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {e.channel === 'email' ? 'Email' : 'SMS'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{fmtManila(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {events.length >= 500 && (
        <p className="text-[12px] text-slate-400">Showing the most recent 500 clicks.</p>
      )}
    </div>
  );
}
