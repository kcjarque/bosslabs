'use client';

import { useEffect, useState } from 'react';

type Affected = { email: string; firstName: string; reason: string; amountCentavos?: number };
type Detail = Affected & { newPassword: boolean; emailSent: boolean; emailError?: string };

/** Admin tool: preview Vault buyers who never got a Hub account, then
 *  provision + email them in one click. Auth is the admin cookie (same-origin);
 *  the server route uses HUB_PROVISION_TOKEN to talk to the Hub. */
/** A buyer looks like a genuine Vault purchase (→ owed a Hub account) when the
 *  order carried a ₱999 Vault bump: exact ₱1,998 (ticket+Vault), or the reason
 *  is a Vault-specific path. 1:1-only bumps (₱3,997) + ambiguous ₱999 + ₱0 test
 *  rows are left UNchecked so an accidental "run" never emails them Hub creds. */
function looksLikeVault(a: Affected): boolean {
  if (a.reason === 'otox-vault' || a.reason === 'oto-vault') return true;
  return a.amountCentavos === 199800; // ₱999 ticket + ₱999 Vault bump
}

export function HubBackfillRunner() {
  const [loading, setLoading] = useState(true);
  const [affected, setAffected] = useState<Affected[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ provisionedCount: number; emailSentCount: number; detail: Detail[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/hub-backfill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      const json = (await res.json()) as { affected?: Affected[]; error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const list = json.affected ?? [];
      setAffected(list);
      // Pre-check only the clear Vault buyers.
      setSelected(new Set(list.filter(looksLikeVault).map((a) => a.email)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPreview();
  }, []);

  function toggle(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  async function run() {
    const emails = [...selected];
    if (emails.length === 0) return;
    if (!window.confirm(`Provision Hub accounts + email credentials to ${emails.length} buyer(s)? This sends real emails.`)) {
      return;
    }
    setRunning(true);
    setError(null);
    try {
      // Explicit list → only the checked buyers (never a blind "all").
      const res = await fetch('/api/admin/hub-backfill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      const json = (await res.json()) as { provisionedCount: number; emailSentCount: number; detail: Detail[]; error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setResult(json);
      setAffected([]); // cleared — re-check to confirm
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  }

  const peso = (c?: number) => (c == null ? '' : `₱${Math.round(c / 100).toLocaleString()}`);

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</div>
      )}

      {/* Preview */}
      <section className="card">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Missing Hub accounts</h2>
          <button
            type="button"
            onClick={loadPreview}
            disabled={loading || running}
            className="text-[12px] font-medium text-cyan-700 hover:underline disabled:opacity-50"
          >
            ↻ Re-check
          </button>
        </div>
        <p className="mt-1 text-[12px] text-slate-500">
          Vault buyers (bumped / OTO) whose payment webhook never provisioned a Hub account.
        </p>

        {loading ? (
          <p className="mt-3 text-[13px] text-slate-500">Scanning…</p>
        ) : affected && affected.length > 0 ? (
          <>
            <p className="mt-2 text-[11.5px] text-slate-500">
              Pre-checked = clear Vault buyers (₱999+₱999). Unchecked = 1:1-only
              or ambiguous — tick only if you&rsquo;re sure they bought the Vault.
            </p>
            <ul className="mt-3 divide-y divide-slate-100">
              {affected.map((a) => {
                const vault = looksLikeVault(a);
                return (
                  <li key={a.email} className="flex items-center gap-3 py-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={selected.has(a.email)}
                      onChange={() => toggle(a.email)}
                      className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-400 text-emerald-600 focus:ring-emerald-400"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-800">{a.firstName}</div>
                      <div className="truncate text-[11px] text-slate-500">{a.email}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-[11px]">
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${
                          vault ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {vault ? 'Vault' : 'review'}
                      </span>
                      {a.amountCentavos != null && <span className="text-slate-500">{peso(a.amountCentavos)}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={run}
              disabled={running || selected.size === 0}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? 'Provisioning + emailing…' : `Provision + email selected (${selected.size})`}
            </button>
          </>
        ) : (
          <p className="mt-3 text-[13px] text-emerald-700">✓ No missing Hub accounts — everyone&rsquo;s provisioned.</p>
        )}
      </section>

      {/* Result */}
      {result && (
        <section className="card">
          <h2 className="text-base font-semibold text-slate-900">Result</h2>
          <p className="mt-1 text-[13px] text-slate-600">
            Provisioned <strong>{result.provisionedCount}</strong> · emailed <strong>{result.emailSentCount}</strong>
          </p>
          <ul className="mt-3 divide-y divide-slate-100">
            {result.detail.map((d) => (
              <li key={d.email} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="truncate text-slate-700">{d.email}</span>
                <span className={`shrink-0 text-[11px] font-medium ${d.emailSent ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {d.newPassword ? (d.emailSent ? 'provisioned + emailed' : `provisioned · email failed${d.emailError ? ` (${d.emailError})` : ''}`) : 'provision failed'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
