import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { PageHeader } from '@/components/admin/PageHeader';
import { MachineTabs } from '@/components/admin/MachineTabs';
import { getSurveyData, type SurveyBreakdown } from '@/lib/machine-stats';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Survey · The Machine · BOSSLABS AI' };

function fmtManila(ts: string): string {
  return new Date(ts).toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'amber' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`truncate text-xl font-semibold tracking-tight ${tone === 'amber' ? 'text-amber-600' : 'text-slate-900'}`}>
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.06em] text-slate-500">{label}</div>
      {sub && <div className="mt-1 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function BreakdownList({
  title,
  hint,
  items,
  barColor,
}: {
  title: string;
  hint: string;
  items: SurveyBreakdown[];
  barColor?: (key: string) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-0.5 text-[12px] text-slate-500">{hint}</p>
      {items.length === 0 ? (
        <p className="mt-4 text-[13px] text-slate-400">No responses yet.</p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {items.map((it) => (
            <div key={it.key}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-700">{it.label}</span>
                <span className="tnum font-medium text-slate-900">
                  {it.count} <span className="text-slate-400">({it.pct}%)</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${barColor ? barColor(it.key) : 'bg-cyan-500'}`}
                  style={{ width: `${(it.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function SurveyAnalyticsPage() {
  await requireAdmin();
  const data = await getSurveyData();
  const topIndustry = data.industry[0];
  const topPain = data.pain[0];
  const dfy = data.intent.find((i) => i.key === 'dfy');

  return (
    <div className="space-y-6">
      <PageHeader
        title="The Machine"
        subtitle="Live vitals of the email machine — so we never argue “is it working” from vibes."
      />
      <MachineTabs active="survey" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total responses" value={String(data.total)} />
        <StatCard
          label="Top industry"
          value={topIndustry?.label ?? '—'}
          sub={topIndustry ? `${topIndustry.count} (${topIndustry.pct}%)` : undefined}
        />
        <StatCard
          label="Top pain point"
          value={topPain?.label ?? '—'}
          sub={topPain ? `${topPain.count} (${topPain.pct}%)` : undefined}
        />
        <StatCard
          label="Want it done for them"
          value={String(dfy?.count ?? 0)}
          sub={dfy ? `${dfy.pct}% of responses — hot leads for DFY` : undefined}
          tone="amber"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <BreakdownList title="Industry" hint="What business they're in." items={data.industry} />
        <BreakdownList title="#1 headache" hint="Their biggest operational pain point right now." items={data.pain} />
        <BreakdownList
          title="Intent"
          hint="Build it themselves, open to help, or fully done-for-them."
          items={data.intent}
          barColor={(key) => (key === 'dfy' ? 'bg-amber-500' : key === 'diy_open' ? 'bg-teal-500' : 'bg-cyan-500')}
        />
        <BreakdownList title="Team size" hint="How big their team is." items={data.teamSize} />
        <BreakdownList title="Tried fixing it before?" hint="Where they are with this problem today." items={data.tried} />
      </div>

      {data.byEvent.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Responses by event</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.byEvent.map((e) => (
              <span
                key={e.eventName}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12.5px] text-slate-700"
              >
                {e.eventName} · <strong className="tnum">{e.count}</strong>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">All responses</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">Newest first — including what people wrote in their own words.</p>
          </div>
          <a
            href="/api/admin/survey-responses.csv"
            className="btn btn-secondary shrink-0"
            download
          >
            Export CSV
          </a>
        </div>
        {data.responses.length === 0 ? (
          <p className="p-8 text-center text-[13.5px] text-slate-400">
            No survey responses yet — they&rsquo;ll appear here as attendees answer the post-signup survey.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">Person</th>
                  <th className="px-4 py-2.5 font-semibold">Event</th>
                  <th className="px-4 py-2.5 font-semibold">Industry</th>
                  <th className="px-4 py-2.5 font-semibold">Team</th>
                  <th className="px-4 py-2.5 font-semibold">Tried before</th>
                  <th className="px-4 py-2.5 font-semibold">#1 headache</th>
                  <th className="px-4 py-2.5 font-semibold">First process to automate</th>
                  <th className="px-4 py-2.5 font-semibold">Intent</th>
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.responses.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      {r.contactId ? (
                        <Link href={`/admin/customers/${r.contactId}`} className="font-medium text-cyan-700 hover:underline">
                          {r.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-700">{r.name}</span>
                      )}
                      {r.email && <div className="text-[11.5px] text-slate-400">{r.email}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{r.eventName}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {r.industryLabel}
                      {r.industryFreetext && (
                        <div className="mt-1 max-w-[160px] truncate text-[11.5px] text-slate-400" title={r.industryFreetext}>
                          &ldquo;{r.industryFreetext}&rdquo;
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{r.teamSizeLabel}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.triedLabel}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] font-medium text-slate-600">
                        {r.painLabel}
                      </span>
                      {r.painFreetext && (
                        <div className="mt-1 max-w-[200px] truncate text-[11.5px] text-slate-400" title={r.painFreetext}>
                          &ldquo;{r.painFreetext}&rdquo;
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.ideaFreetext ? (
                        <div className="max-w-[260px] truncate text-slate-600" title={r.ideaFreetext}>
                          {r.ideaFreetext}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${
                          r.intent === 'dfy'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : r.intent === 'diy_open'
                              ? 'border-teal-200 bg-teal-50 text-teal-700'
                              : r.intent === 'diy'
                                ? 'border-slate-200 bg-slate-50 text-slate-600'
                                : 'border-slate-100 bg-slate-50 text-slate-300'
                        }`}
                        title={r.intentLabel}
                      >
                        {r.intent === 'dfy' ? 'DFY' : r.intent === 'diy_open' ? 'DIY+' : r.intent === 'diy' ? 'DIY' : '—'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{fmtManila(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.responses.length >= 1000 && (
        <p className="text-[12px] text-slate-400">Showing the most recent 1,000 responses.</p>
      )}
    </div>
  );
}
