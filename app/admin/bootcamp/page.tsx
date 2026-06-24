import { listBootcampCards } from '@/lib/bootcamp-crm';
import {
  BOOTCAMP_TOTAL_SEATS,
  bootcampSeatsRemaining,
  listBootcampReservations,
  BOOTCAMP_TIERS,
} from '@/lib/bootcamp';
import { BootcampCrmBoard } from '@/components/admin/BootcampCrmBoard';
import { formatPHP } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function BootcampAdminPage() {
  const [cards, seatsLeft, reservations] = await Promise.all([
    listBootcampCards(),
    bootcampSeatsRemaining(),
    listBootcampReservations(),
  ]);

  const taken = BOOTCAMP_TOTAL_SEATS - seatsLeft;
  // Fully paid = card cleared AND balance is zero (vs. DP-only which is still status='paid').
  const paidReservations = reservations.filter((r) => r.status === 'paid' && r.balanceDueCentavos === 0);
  const totalDpCollected = reservations
    .filter((r) => r.status !== 'reserved')
    .reduce((sum, r) => sum + r.amountDueCentavos, 0);
  const totalContractValue = reservations
    .filter((r) => r.status !== 'reserved')
    .reduce((sum, r) => sum + r.totalCentavos, 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AI Founder's Bootcamp</h1>
          <p className="mt-1 text-sm text-slate-500">
            80-seat cohort · {seatsLeft} seats remaining · {taken} taken
          </p>
        </div>
        <a
          href="/founders-bootcamp"
          target="_blank"
          rel="noopener"
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
        >
          View public funnel ↗
        </a>
      </header>

      {/* Stats cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Seats remaining" value={`${seatsLeft} / ${BOOTCAMP_TOTAL_SEATS}`} tone={seatsLeft <= 10 ? 'warn' : 'ok'} />
        <Stat label="Reservations" value={String(reservations.length)} />
        <Stat label="Fully paid" value={String(paidReservations.length)} />
        <Stat label="DP collected" value={formatPHP(totalDpCollected)} subline={`Total contract: ${formatPHP(totalContractValue)}`} />
      </section>

      {/* Pricing tiers reference */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Pricing tiers</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BOOTCAMP_TIERS.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t.label}</div>
              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                {formatPHP(t.perSeatCentavos)} <span className="text-xs font-normal text-slate-400">/ seat</span>
              </div>
              <div className="mt-1 text-[12px] text-slate-500">
                {t.seats} seat{t.seats === 1 ? '' : 's'} · total {formatPHP(t.totalCentavos)}
              </div>
              <div className="mt-1 text-[12px] text-slate-500">
                DP: <span className="font-semibold text-slate-700">{formatPHP(t.downpaymentCentavos)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CRM board */}
      <section>
        <BootcampCrmBoard initialCards={cards} />
      </section>
    </div>
  );
}

function Stat({ label, value, subline, tone = 'ok' }: { label: string; value: string; subline?: string; tone?: 'ok' | 'warn' }) {
  const ring = tone === 'warn' ? 'ring-1 ring-rose-300/40' : '';
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${ring}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      {subline && <div className="mt-0.5 text-[12px] text-slate-500">{subline}</div>}
    </div>
  );
}
