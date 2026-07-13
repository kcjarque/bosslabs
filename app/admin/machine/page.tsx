import { requireAdmin } from '@/lib/admin-auth';
import { PageHeader } from '@/components/admin/PageHeader';
import { getMachineStats } from '@/lib/machine-stats';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'The Machine · BOSSLABS AI' };

const STATE_LABEL: Record<string, string> = {
  active_broadcast: 'Active (broadcast)',
  in_sequence: 'In sequence',
  in_sos: 'In SOS',
  in_winback: 'Win-back',
  sunset: 'Sunset',
};
const OFFER_LABEL: Record<string, string> = {
  retreat: 'VibeCode Retreat',
  dfy: 'Done-For-You',
  vault: 'AI Vault',
  oto_1on1: '1:1 Executive Session',
};

export default async function MachinePage() {
  requireAdmin();
  const s = await getMachineStats();
  const stateOrder = ['active_broadcast', 'in_sequence', 'in_sos', 'in_winback', 'sunset'];
  const offerOrder = ['retreat', 'dfy', 'oto_1on1', 'vault'];

  return (
    <div className="space-y-6">
      <PageHeader
        title="The Machine"
        subtitle="Live vitals of the email machine — so we never argue “is it working” from vibes. Rolling 30 days for clicks; all-time for the rest. (SOS / DFY apps / vault-downsell / reviews land as those phases ship.)"
      />

      {/* Interested leads — the click-driven buying signal */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Interested leads (from clicks)</h2>
        <p className="mt-0.5 text-[12px] text-slate-500">Contacts who clicked an offer link — your warm list, tagged automatically.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {offerOrder.map((k) => (
            <div key={k} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="tnum text-2xl font-semibold text-slate-900">{s.interest[k] ?? 0}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{OFFER_LABEL[k]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* List state distribution */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">List state distribution</h2>
        <p className="mt-0.5 text-[12px] text-slate-500">Every contact is in exactly one sending state — the machine&rsquo;s vital signs.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {stateOrder.map((st) => (
            <span key={st} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12.5px] text-slate-700">
              {STATE_LABEL[st]} · <strong className="tnum">{s.sendStates[st] ?? 0}</strong>
            </span>
          ))}
        </div>
      </section>

      {/* Clicks by tag × channel */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Offer-link clicks — last 30 days</h2>
        <p className="mt-0.5 text-[12px] text-slate-500">Which stories move people, and which channel drives the tap.</p>
        {s.clicks.length === 0 ? (
          <p className="mt-4 text-[13px] text-slate-400">No clicks tracked yet — they&rsquo;ll appear as tagged links get tapped.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4 font-medium">Link tag</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">SMS</th>
                  <th className="py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {s.clicks.map((c) => (
                  <tr key={c.linkTag} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pr-4"><code className="text-[12px]">{c.linkTag}</code></td>
                    <td className="tnum py-2 pr-4 text-slate-600">{c.email}</td>
                    <td className="tnum py-2 pr-4 text-slate-600">{c.sms}</td>
                    <td className="tnum py-2 font-semibold text-slate-900">{c.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Survey + attendance */}
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Survey completion</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">Health of the tagging engine (target &gt;60%).</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="tnum text-3xl font-semibold text-slate-900">{s.survey.pct}%</span>
            <span className="text-[13px] text-slate-500">{s.survey.responses} responses · {s.survey.paid} paid</span>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Attendance</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">Imported from the Zoom CSV per event.</p>
          <div className="mt-3 space-y-1.5">
            {s.attendance.length === 0 ? (
              <p className="text-[13px] text-slate-400">No attendance imported yet.</p>
            ) : (
              s.attendance.map((a) => (
                <div key={a.eventId} className="flex items-center justify-between text-[13px]">
                  <span className="truncate text-slate-600">{a.eventName}</span>
                  <span className="tnum font-semibold text-slate-900">{a.attended}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
