import { requireAdmin } from '@/lib/admin-auth';
import { PageHeader } from '@/components/admin/PageHeader';
import { MachineTabs } from '@/components/admin/MachineTabs';
import { getDripPerformance } from '@/lib/machine-stats';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Drip performance · The Machine · BOSSLABS AI' };

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// Colour the rate so a weak subject (open) or weak body (click) is obvious.
// Rows with too little delivered volume stay neutral — not enough to judge.
function openTone(rate: number, delivered: number): string {
  if (delivered < 10) return 'text-slate-400';
  if (rate < 0.25) return 'text-rose-600 font-semibold';
  if (rate < 0.4) return 'text-amber-600';
  return 'text-emerald-700';
}
function clickTone(rate: number, delivered: number): string {
  if (delivered < 10) return 'text-slate-400';
  if (rate < 0.02) return 'text-rose-600 font-semibold';
  if (rate < 0.05) return 'text-amber-600';
  return 'text-emerald-700';
}

export default async function DripPerformancePage() {
  requireAdmin();
  const rows = await getDripPerformance();
  const totals = rows.reduce(
    (t, r) => ({
      sent: t.sent + r.sent,
      delivered: t.delivered + r.delivered,
      opened: t.opened + r.opened,
      clicked: t.clicked + r.clicked,
    }),
    { sent: 0, delivered: 0, opened: 0, clicked: 0 },
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="The Machine"
        subtitle="Live vitals of the email machine — so we never argue “is it working” from vibes."
      />
      <MachineTabs active="drip" />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Every email in the drip — how it performs</h2>
        <p className="mt-0.5 text-[12px] text-slate-500">
          Low <strong>open rate</strong> → the subject line isn&rsquo;t landing. Low <strong>click rate</strong> → the
          body / CTA needs work. All-time, most-sent first.
        </p>

        {rows.length === 0 ? (
          <p className="mt-4 text-[13px] text-slate-400">
            No emails logged yet — each template shows up here as it starts sending.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-2.5 font-semibold">Email</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Sent</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Delivered</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Opened</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Clicked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.templateId} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                    <td className="px-2 py-2.5">
                      <div className="font-medium text-slate-800">{r.name}</div>
                      {r.subject && (
                        <div className="max-w-[360px] truncate text-[11.5px] text-slate-400" title={r.subject}>
                          {r.subject}
                        </div>
                      )}
                      {r.bounced > 0 && <div className="text-[11px] text-rose-500">{r.bounced} bounced</div>}
                    </td>
                    <td className="tnum px-2 py-2.5 text-right text-slate-600">{r.sent.toLocaleString()}</td>
                    <td className="tnum px-2 py-2.5 text-right text-slate-600">{r.delivered.toLocaleString()}</td>
                    <td className="tnum px-2 py-2.5 text-right">
                      <span className={openTone(r.openRate, r.delivered)}>{pct(r.openRate)}</span>
                      <div className="text-[11px] text-slate-400">{r.opened.toLocaleString()}</div>
                    </td>
                    <td className="tnum px-2 py-2.5 text-right">
                      <span className={clickTone(r.clickRate, r.delivered)}>{pct(r.clickRate)}</span>
                      <div className="text-[11px] text-slate-400">{r.clicked.toLocaleString()}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 text-[12px] font-semibold text-slate-700">
                  <td className="px-2 py-2.5">All emails</td>
                  <td className="tnum px-2 py-2.5 text-right">{totals.sent.toLocaleString()}</td>
                  <td className="tnum px-2 py-2.5 text-right">{totals.delivered.toLocaleString()}</td>
                  <td className="tnum px-2 py-2.5 text-right">
                    {totals.delivered ? pct(totals.opened / totals.delivered) : '—'}
                  </td>
                  <td className="tnum px-2 py-2.5 text-right">
                    {totals.delivered ? pct(totals.clicked / totals.delivered) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-3 text-[11.5px] text-slate-400">
              Open / click rates are over <em>delivered</em> (industry standard). Rows with under 10 delivered stay
              grey — too small to judge yet. Green is healthy, amber is soft, red needs a rewrite.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
