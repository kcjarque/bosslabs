import { redirect } from 'next/navigation';
import { requireAdmin, getAdminSession } from '@/lib/admin-auth';
import { listMyReimbursementRequests } from '@/lib/reimbursements';
import { manilaToday } from '@/lib/finance';
import { ReimbursementsTabs } from '@/components/ReimbursementsTabs';
import { ReceiptUploadField } from '@/components/admin/ReceiptUploadField';
import { DeleteReimbursementButton } from '@/components/reimbursements/DeleteReimbursementButton';
import { submitReimbursementAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My reimbursements · BOSSLABS AI' };

const peso = (c: number) =>
  `₱${(c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CATEGORY_LABEL: Record<string, string> = {
  transport: 'Transport',
  meals: 'Meals',
  supplies: 'Supplies',
  other: 'Other',
};

export default async function MyReimbursementsPage() {
  requireAdmin();
  const session = getAdminSession();
  // The shared Admin login has no staff_accounts row to attach a claim to —
  // send it to the side of this feature that's actually theirs.
  if (!session || session.role !== 'staff' || !session.id) {
    redirect('/admin/reimbursements/payable');
  }

  const requests = await listMyReimbursementRequests(session.id);
  const pending = requests.filter((r) => r.status === 'pending');
  const paid = requests.filter((r) => r.status !== 'pending');
  const pendingTotal = pending.reduce((s, r) => s + r.amountCentavos, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          My Reimbursements
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Submit an expense and it lands straight in the admin&rsquo;s payable list — no review step. Set
          your payout method on the{' '}
          <a href="/admin/reimbursements/settings" className="text-cyan-700 hover:underline">
            My Settings
          </a>{' '}
          tab so admin knows where to send it.
        </p>
      </header>

      <ReimbursementsTabs active="requests" role="staff" />

      <div className="grid gap-6 md:grid-cols-[360px_1fr]">
        <form action={submitReimbursementAction} className="card h-fit space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Submit an expense</h3>
          <div>
            <label className="label">What was it for</label>
            <input name="description" required placeholder="e.g. Grab to client site" className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount (₱)</label>
              <input name="amount" required inputMode="decimal" placeholder="0.00" className="input" />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" name="spentOn" defaultValue={manilaToday()} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Category</label>
            <select name="category" className="select" defaultValue="other">
              <option value="transport">Transport</option>
              <option value="meals">Meals</option>
              <option value="supplies">Supplies</option>
              <option value="other">Other</option>
            </select>
          </div>
          <ReceiptUploadField />
          <button type="submit" className="btn btn-primary w-full">
            Submit for reimbursement
          </button>
        </form>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Pending" value={peso(pendingTotal)} tint="text-amber-700" />
            <Stat label="Claims pending" value={String(pending.length)} />
          </div>

          <div className="card">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Pending</h3>
            {pending.length === 0 ? (
              <p className="text-[13px] text-slate-400">Nothing pending — submitted claims show up here.</p>
            ) : (
              <ul className="space-y-2">
                {pending.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-slate-800">{r.description}</div>
                      <div className="text-[11px] text-slate-500">
                        {CATEGORY_LABEL[r.category]} ·{' '}
                        {new Date(r.spentOn).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
                        {r.receiptUrl && (
                          <>
                            {' · '}
                            <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-700 hover:underline">
                              receipt
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-[13px] font-semibold text-amber-700">{peso(r.amountCentavos)}</span>
                    <DeleteReimbursementButton requestId={r.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">History</h3>
            {paid.length === 0 ? (
              <p className="text-[13px] text-slate-400">No paid reimbursements yet.</p>
            ) : (
              <ul className="space-y-2">
                {paid.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 border-t border-slate-100 py-2 first:border-t-0 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-slate-800">{r.description}</div>
                      <div className="text-[11px] text-slate-500">
                        {CATEGORY_LABEL[r.category]} ·{' '}
                        {new Date(r.spentOn).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-[13px] font-semibold ${
                        r.status === 'paid' ? 'text-emerald-700' : 'text-slate-400 line-through'
                      }`}
                    >
                      {peso(r.amountCentavos)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
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
