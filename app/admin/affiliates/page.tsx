import { requireAdmin } from '@/lib/admin-auth';
import {
  listAffiliates,
  getAffiliateStats,
  listCommissions,
  getAffiliateProgram,
  PUBLIC_SITE_URL,
  type Affiliate,
} from '@/lib/affiliates';
import { formatPHP } from '@/lib/config';
import {
  createAffiliateAction,
  toggleAffiliateAction,
  markCommissionPaidAction,
  saveAffiliateProgramAction,
} from './actions';

export const dynamic = 'force-dynamic';

function rate(a: Affiliate): string {
  return a.commissionType === 'fixed'
    ? `${formatPHP(a.commissionValue)} / sale`
    : `${a.commissionValue}%`;
}

export default async function AffiliatesPage() {
  requireAdmin();
  const base = PUBLIC_SITE_URL;
  const affiliates = await listAffiliates();
  const stats = await Promise.all(affiliates.map((a) => getAffiliateStats(a)));
  const byId = new Map(affiliates.map((a) => [a.id, a]));
  const commissions = await listCommissions();
  const program = await getAffiliateProgram();

  const totalPending = commissions
    .filter((c) => c.status === 'pending')
    .reduce((s, c) => s + c.commissionCentavos, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Affiliates
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {affiliates.length} affiliate{affiliates.length === 1 ? '' : 's'} ·{' '}
          <strong className="text-slate-700">{formatPHP(totalPending)}</strong> pending payout.
          First-touch attribution, 15-day cookie.
        </p>
      </header>

      {/* Create */}
      <form action={createAffiliateAction} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className="label">Name</label>
          <input name="name" className="input" placeholder="Juan Dela Cruz" required />
        </div>
        <div>
          <label className="label">Link code</label>
          <input name="code" className="input font-mono" placeholder="blank = random" />
        </div>
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" className="input" placeholder="optional" />
        </div>
        <div>
          <label className="label">Type</label>
          <select name="commissionType" className="input" defaultValue="percent">
            <option value="percent">Percent %</option>
            <option value="fixed">Fixed ₱</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label">Value</label>
            <input name="commissionValue" type="number" step="0.01" min="0" className="input" placeholder="20" required />
          </div>
          <button type="submit" className="btn btn-primary">Add</button>
        </div>
      </form>

      {/* Promo kit / resources — shown to all affiliates on their dashboard */}
      <form action={saveAffiliateProgramAction} className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Promo kit (shown to every affiliate)</h2>
          <button type="submit" className="btn btn-primary text-xs">Save kit</button>
        </div>
        <div>
          <label className="label">Swipe copy &amp; captions</label>
          <textarea
            name="swipeCopy"
            defaultValue={program.swipeCopy}
            placeholder="Ready-to-paste captions/hooks affiliates can post…"
            className="input min-h-[120px] font-mono text-[13px]"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Images + video pack URL</label>
            <input name="assetsUrl" defaultValue={program.assetsUrl} placeholder="Google Drive / Dropbox folder link" className="input" />
          </div>
          <div>
            <label className="label">One-pager URL</label>
            <input name="onePagerUrl" defaultValue={program.onePagerUrl} placeholder="Link to the why-this-webinar PDF" className="input" />
          </div>
        </div>
      </form>

      {/* Affiliates */}
      {affiliates.length === 0 ? (
        <div className="card text-sm text-slate-500">No affiliates yet — add one above.</div>
      ) : (
        <div className="space-y-3">
          {affiliates.map((a, i) => {
            const s = stats[i];
            const share = `${base}/r/${a.code}`;
            const dash = `${base}/affiliate/${a.dashboardToken}`;
            return (
              <div key={a.id} className="card">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900">{a.name}</h2>
                      <span className={`pill ${a.active ? 'pill-green' : ''}`}>
                        {a.active ? 'Active' : 'Paused'}
                      </span>
                      <span className="pill pill-cyan">{rate(a)}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Share: <span className="font-mono text-slate-700">{share}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Their dashboard:{' '}
                      <a href={dash} target="_blank" rel="noreferrer" className="font-mono text-cyan-700 underline">
                        {dash}
                      </a>
                    </div>
                  </div>
                  <form action={toggleAffiliateAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="active" value={a.active ? '0' : '1'} />
                    <button className="btn btn-secondary text-xs">
                      {a.active ? 'Pause' : 'Activate'}
                    </button>
                  </form>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Stat label="Clicks" value={s.clicks} />
                  <Stat label="Referred" value={s.referredSignups} />
                  <Stat label="Paid" value={s.paidConversions} />
                  <Stat label="Pending ₱" value={formatPHP(s.earningsPendingCentavos)} />
                  <Stat label="Paid out ₱" value={formatPHP(s.earningsPaidCentavos)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Commission ledger */}
      <div className="card">
        <h2 className="text-base font-semibold text-slate-900">Commission ledger</h2>
        <p className="mt-1 text-xs text-slate-500">Mark each as paid when you settle it.</p>
        {commissions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No commissions yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2">Affiliate</th>
                  <th>Sale</th>
                  <th>Commission</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="py-2 text-slate-700">{byId.get(c.affiliateId)?.name ?? '—'}</td>
                    <td>{formatPHP(c.saleCentavos)}</td>
                    <td className="font-medium text-slate-900">{formatPHP(c.commissionCentavos)}</td>
                    <td>
                      <span className={`pill ${c.status === 'paid' ? 'pill-green' : c.status === 'void' ? '' : 'pill-cyan'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="text-right">
                      {c.status === 'pending' && (
                        <form action={markCommissionPaidAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button className="btn btn-secondary text-xs">Mark paid</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
      <div className="text-base font-semibold text-slate-900">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{label}</div>
    </div>
  );
}
