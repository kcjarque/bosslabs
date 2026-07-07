import { requireAdmin } from '@/lib/admin-auth';
import { listAllUpsellActivity } from '@/lib/closer-upsell';
import { ClosersTabs } from '@/components/ClosersTabs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Closer upsells · BOSSLABS AI' };

const peso = (c: number) => `₱${(c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PRODUCT_LABEL: Record<string, string> = {
  retreat: 'VibeCode Retreat',
  vault: 'Vault',
  build_session: 'Executive Session',
};
const STAGE_TINT: Record<string, string> = {
  new: 'bg-slate-100 text-slate-600',
  contacted: 'bg-amber-50 text-amber-700',
  sent: 'bg-cyan-50 text-cyan-700',
  won: 'bg-emerald-50 text-emerald-700',
  lost: 'bg-rose-50 text-rose-600',
};

function ChannelPill({ label, status }: { label: string; status: string }) {
  const tone =
    status === 'sent' ? 'bg-emerald-50 text-emerald-700'
      : status === 'failed' ? 'bg-rose-50 text-rose-600'
        : status === 'skipped' ? 'bg-slate-100 text-slate-400'
          : 'bg-amber-50 text-amber-700';
  const mark = status === 'sent' ? '✓' : status === 'failed' ? '✕' : status === 'skipped' ? '–' : '…';
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>{label} {mark}</span>;
}

export default async function CloserUpsellsPage() {
  requireAdmin();
  const rows = await listAllUpsellActivity();

  const allLeads = rows.flatMap((r) => r.leads);
  const allSends = allLeads.flatMap((l) => l.sends);
  const totalClaimed = allLeads.length;
  const totalCodes = allSends.length;
  const emailsSent = allSends.filter((s) => s.emailStatus === 'sent').length;
  const smsSent = allSends.filter((s) => s.smsStatus === 'sent').length;
  const won = allLeads.filter((l) => l.stage === 'won').length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Closer upsells</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every closer&rsquo;s claimed customers and the personal promo codes they sent — product,
          discount, and whether the SMS + email went out.
        </p>
      </header>

      <ClosersTabs active="upsells" />

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Customers claimed" value={String(totalClaimed)} />
        <Stat label="Codes sent" value={String(totalCodes)} tint="text-cyan-700" />
        <Stat label="Emails delivered" value={String(emailsSent)} tint="text-emerald-700" />
        <Stat label="SMS delivered" value={String(smsSent)} tint="text-emerald-700" />
        <Stat label="Won" value={String(won)} tint="text-emerald-700" />
      </div>

      {/* Per-closer breakdown */}
      <div className="space-y-3">
        {rows.length === 0 && (
          <div className="card text-sm text-slate-500">No closer upsell activity yet.</div>
        )}
        {rows.map((r) => {
          const sent = r.leads.reduce((s, l) => s + l.sends.length, 0);
          return (
            <div key={r.closerId} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{r.closerName}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">@{r.closerUsername}</span>
                <span className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{r.leads.length} claimed</span>
                  <span className="rounded-full bg-cyan-50 px-2 py-0.5 font-medium text-cyan-700">{sent} sent</span>
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {r.leads.map((l) => (
                  <div key={l.leadId} className="rounded-lg border border-slate-100 bg-slate-50/40 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{l.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STAGE_TINT[l.stage] ?? 'bg-slate-100 text-slate-500'}`}>{l.stage}</span>
                      {l.email && <span className="text-[11px] text-slate-400">{l.email}</span>}
                    </div>
                    {l.sends.length === 0 ? (
                      <div className="mt-1 text-[11px] text-slate-300">No code sent yet.</div>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {l.sends.map((s) => (
                          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                            <span className="font-medium text-slate-700">{PRODUCT_LABEL[s.product] ?? s.product}</span>
                            <span className="font-mono text-slate-500">{s.promoCode}</span>
                            <span className="text-slate-500">{s.discountLabel} → <span className="font-medium text-slate-800">{peso(s.finalCentavos)}</span></span>
                            <span className="flex gap-1.5">
                              <ChannelPill label="Email" status={s.emailStatus} />
                              <ChannelPill label="SMS" status={s.smsStatus} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tint ?? 'text-slate-900'}`}>{value}</div>
    </div>
  );
}
