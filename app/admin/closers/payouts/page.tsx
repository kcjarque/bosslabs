import { requireAdmin } from '@/lib/admin-auth';
import { listPayouts } from '@/lib/closers';
import { ClosersTabs } from '@/components/ClosersTabs';
import { PayoutHistoryRow } from '@/components/closers/PayoutHistoryRow';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payout history · BOSSLABS AI' };

const peso = (c: number) =>
  `₱${(c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function CloserPayoutHistoryPage() {
  requireAdmin();
  const payouts = await listPayouts();

  const paid = payouts.filter((p) => p.status === 'paid');
  const totalPaid = paid.reduce((s, p) => s + p.amountCentavos, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Payout history
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Every closer payout, newest first. Click a row to expand and see the commissions it covered.
        </p>
      </header>

      <ClosersTabs active="payouts" />

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Lifetime paid out" value={peso(totalPaid)} tint="text-emerald-700" />
        <Stat label="Payouts" value={String(paid.length)} />
        <Stat
          label="Voided"
          value={String(payouts.length - paid.length)}
          tint={payouts.length - paid.length > 0 ? 'text-rose-600' : undefined}
        />
      </div>

      {/* History */}
      <div className="space-y-3">
        {payouts.length === 0 ? (
          <div className="card text-sm text-slate-500">
            No payouts yet. Settle a closer&rsquo;s pending commissions on the{' '}
            <a href="/admin/closers/commissions" className="text-cyan-700 hover:underline">
              Commissions
            </a>{' '}
            tab and they&rsquo;ll show up here.
          </div>
        ) : (
          payouts.map((p) => <PayoutHistoryRow key={p.id} payout={p} />)
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`bl-private mt-1 text-xl font-semibold ${tint ?? 'text-slate-900'}`}>{value}</div>
    </div>
  );
}
