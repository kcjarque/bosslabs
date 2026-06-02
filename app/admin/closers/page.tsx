import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { getCloserAssignments, type AssignmentLead } from '@/lib/closers';
import { ClosersTabs } from '@/components/ClosersTabs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Closer assignments · BOSSLABS AI' };

const peso = (c: number) => `₱${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function CloserAssignmentsPage() {
  requireAdmin();
  const { rows, unassignedCount } = await getCloserAssignments();

  const totalActive = rows.reduce((s, r) => s + r.active.length, 0);
  const totalClosed = rows.reduce((s, r) => s + r.closed.length, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commissionTotalCentavos, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Sales closers
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Live view of every closer&rsquo;s claimed leads — how many they&rsquo;re working and how
          many they&rsquo;ve closed.
        </p>
      </header>

      <ClosersTabs active="assignments" />

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Unassigned pool" value={String(unassignedCount)} />
        <Stat label="Working (claimed)" value={String(totalActive)} tint="text-cyan-700" />
        <Stat label="Closed — won" value={String(totalClosed)} tint="text-emerald-700" />
        <Stat label="Commissions" value={peso(totalCommission)} tint="text-emerald-700" />
      </div>

      {/* Per-closer breakdown */}
      <div className="space-y-3">
        {rows.length === 0 && (
          <div className="card text-sm text-slate-500">No closers yet.</div>
        )}
        {rows.map((r) => (
          <div key={r.closer.id} className="card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">{r.closer.name}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">@{r.closer.username}</span>
              {!r.closer.active && (
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-600">inactive</span>
              )}
              <span className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-full bg-cyan-50 px-2 py-0.5 font-medium text-cyan-700">{r.active.length} working</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">{r.closed.length} closed</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">{peso(r.commissionTotalCentavos)}</span>
              </span>
            </div>

            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <LeadList title="Working" tone="cyan" leads={r.active} mode="active" />
              <LeadList title="Closed — Won" tone="emerald" leads={r.closed} mode="closed" />
            </div>
          </div>
        ))}
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

function LeadList({
  title,
  tone,
  leads,
  mode,
}: {
  title: string;
  tone: 'cyan' | 'emerald';
  leads: AssignmentLead[];
  mode: 'active' | 'closed';
}) {
  const dot = tone === 'cyan' ? 'bg-cyan-500' : 'bg-emerald-500';
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-2.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {title}
        <span className="ml-auto text-[11px] text-slate-400">{leads.length}</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {leads.length === 0 && <li className="text-[11px] text-slate-300">None</li>}
        {leads.map((l, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-slate-700">{l.name}</span>
            {mode === 'active' ? (
              <span className="shrink-0 text-[11px] text-slate-400">{ago(l.claimedAt)}</span>
            ) : (
              <span className="shrink-0 text-[11px] font-medium text-emerald-700">
                {l.commissionCentavos != null ? `+${peso(l.commissionCentavos)}` : '—'}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
