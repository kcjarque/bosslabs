import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { getFunnels } from '@/lib/db';

export const dynamic = 'force-dynamic';

function peso(centavos?: number | null): string {
  if (centavos == null) return '—';
  return `₱${(centavos / 100).toLocaleString()}`;
}

export default async function FunnelsPage() {
  requireAdmin();
  const funnels = await getFunnels();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Funnels
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {funnels.length} funnel{funnels.length === 1 ? '' : 's'}. Each funnel
          is a distinct offer + audience path. The webinar funnel's live
          config lives in Settings; everything else is managed here.
        </p>
      </header>

      {funnels.length === 0 && (
        <div className="card border-amber-200 bg-amber-50/40 text-amber-800">
          <p className="text-sm">
            No funnels yet. Run the funnels migration + seed script (see the
            commit notes) to load the webinar + VibeCode Retreat funnels.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {funnels.map((f) => {
          const c = f.config;
          return (
            <Link
              key={f.id}
              href={`/admin/funnels/${f.id}`}
              className="card block transition hover:border-slate-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">
                      {f.name}
                    </h2>
                    {f.active ? (
                      <span className="pill pill-green">Active</span>
                    ) : (
                      <span className="pill">Paused</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    <span className="font-mono">{f.slug}</span> · {f.kind}
                  </div>
                </div>
              </div>

              {f.kind === 'event' ? (
                <div className="mt-4 space-y-2 text-sm">
                  {c.tagline && (
                    <p className="font-medium text-slate-800">{c.tagline}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    {c.standardPriceCentavos != null && (
                      <span>
                        Standard{' '}
                        <strong className="text-slate-900">
                          {peso(c.standardPriceCentavos)}
                        </strong>
                      </span>
                    )}
                    {c.payInFullPriceCentavos != null && (
                      <span>
                        Pay-in-full{' '}
                        <strong className="text-emerald-700">
                          {peso(c.payInFullPriceCentavos)}
                        </strong>
                      </span>
                    )}
                    {c.depositCentavos != null && (
                      <span>Deposit {peso(c.depositCentavos)}</span>
                    )}
                    {c.capacity != null && <span>{c.capacity} seats</span>}
                  </div>
                  {c.paymentMethods && c.paymentMethods.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {c.paymentMethods.map((m) => (
                        <span key={m} className="pill pill-cyan">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Webinar funnel — dates, Zoom links + deliverables live in{' '}
                  <span className="font-medium text-slate-700">Settings</span>.
                </p>
              )}

              <div className="mt-4 text-xs font-medium text-cyan-700">
                Configure →
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
