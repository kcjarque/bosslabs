'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AI_PHASE1_BANK,
  AI_PHASE2_BANK,
  DEFAULT_PROPOSAL_FORM,
  INTEGRATION_BANK,
  PROPOSAL_OPTIONS,
  SHIP_LOG_BANK,
  findProposalOption,
  newModule,
  type ProposalFormData,
  type ProposalModule,
} from '@/lib/proposal-defaults';
import { ProposalDocument } from './ProposalDocument';
import { CustomerLinkPicker, type LinkedCustomer } from './CustomerLinkPicker';

/** Strip filesystem-hostile characters from a string used as a filename
 *  segment. Keeps letters, digits, dashes, underscores; collapses everything
 *  else into a single dash. */
function safeFilenameSegment(s: string, fallback = 'Client'): string {
  const cleaned = s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  return cleaned.length > 0 ? cleaned.slice(0, 60) : fallback;
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200';
const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-600';

const MAX_SHIP_LOG = 5;

export function ProposalMaker({
  initial,
  proposalId: initialProposalId,
  initialLinked,
}: {
  /** Pre-fill the form (for /admin/proposals/[id] edit mode). Defaults to the
   *  blank DEFAULT_PROPOSAL_FORM. */
  initial?: ProposalFormData;
  /** When set, Save sends PATCH /api/admin/proposals/[id]. When undefined,
   *  Save sends POST /api/admin/proposals and then router.pushes to the new
   *  proposal's edit URL. */
  proposalId?: string;
  /** Pre-link a customer (so the "Linked customer" chip is filled on edit mode). */
  initialLinked?: LinkedCustomer | null;
} = {}) {
  const router = useRouter();
  const [data, setData] = useState<ProposalFormData>(initial ?? DEFAULT_PROPOSAL_FORM);
  const [proposalId, setProposalId] = useState<string | null>(initialProposalId ?? null);
  const [linked, setLinked] = useState<LinkedCustomer | null>(initialLinked ?? null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Mobile tab — desktop shows both panes side-by-side; small screens swap
  // between "Edit" and "Preview" so the preview is readable at full width.
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');

  async function saveProposal() {
    if (saving) return;
    if (!data.clientCompanyName.trim()) {
      window.alert('Add a client company name before saving.');
      return;
    }
    setSaving(true);
    try {
      const body = { ...data, signupId: linked?.signupId ?? null };
      const url = proposalId ? `/api/admin/proposals/${proposalId}` : '/api/admin/proposals';
      const method = proposalId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        proposal?: { id: string; proposalNo?: string };
        error?: string;
      };
      if (!res.ok || !json.proposal) {
        throw new Error(json.error || `Save failed (${res.status})`);
      }
      setSavedAt(Date.now());
      // Reflect the server-assigned proposal number in the form/preview.
      if (json.proposal.proposalNo) {
        setData((prev) => ({ ...prev, proposalNo: json.proposal!.proposalNo! }));
      }
      // First save → URL changes from /new → /[id] so refreshes preserve state.
      if (!proposalId) {
        setProposalId(json.proposal.id);
        router.push(`/admin/proposals/${json.proposal.id}`);
      }
    } catch (err) {
      console.error('[proposal] save failed', err);
      window.alert(err instanceof Error ? err.message : 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  // PDF download state — disables the button + shows progress while html2pdf
  // renders. Async because html2pdf is dynamically imported (it touches
  // `window` at module load, would break SSR).
  const [downloading, setDownloading] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  async function downloadPdf() {
    const el = pageRef.current;
    if (!el || downloading) return;
    setDownloading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const client = safeFilenameSegment(data.clientCompanyName, 'Client');
      const filename = `BossLabs-Proposal-${client}-${today}.pdf`;
      // Dynamic import — html2pdf reads `window` at the top of its module.
      const html2pdfMod = await import('html2pdf.js');
      const html2pdf = (html2pdfMod.default ?? html2pdfMod) as (() => {
        set: (opts: Record<string, unknown>) => { from: (el: HTMLElement) => { save: () => Promise<void> } };
      });
      await html2pdf()
        .set({
          filename,
          // No outer margin — the .proposal-page element is already 210mm wide
          // (full A4) with its own internal padding for the visual margins.
          margin: 0,
          image: { type: 'jpeg', quality: 0.96 },
          // windowWidth pins the canvas viewport to the page's render width in
          // pixels so html2canvas captures the same layout the user sees.
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 794 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        })
        .from(el)
        .save();
    } catch (err) {
      console.error('[proposal] PDF download failed', err);
      window.alert('Sorry, the PDF could not be generated. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  const pickOption = (id: ProposalFormData['optionId']) => {
    const opt = findProposalOption(id);
    // Auto-fill the investment figures from the picked option's defaults.
    setData((prev) => ({
      ...prev,
      optionId: id,
      oneTimeTotalCentavos: opt.oneTimeTotalCentavos,
      monthlyRetainerCentavos: opt.monthlyRetainerCentavos,
      minRetainerMonths: opt.minRetainerMonths,
      exitFeeCentavos: opt.exitFeeCentavos,
    }));
  };

  // ── Module row helpers ──────────────────────────────────────────────────
  const updateModule = (id: string, patch: Partial<ProposalModule>) => {
    setData((prev) => ({
      ...prev,
      modules: prev.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  };
  const removeModule = (id: string) => {
    setData((prev) => ({ ...prev, modules: prev.modules.filter((m) => m.id !== id) }));
  };
  const addModule = () => {
    setData((prev) => ({ ...prev, modules: [...prev.modules, newModule()] }));
  };

  // ── Ship Log picker ─────────────────────────────────────────────────────
  const toggleShipLog = (id: string) => {
    setData((prev) => {
      const has = prev.shipLog.includes(id);
      if (has) return { ...prev, shipLog: prev.shipLog.filter((s) => s !== id) };
      if (prev.shipLog.length >= MAX_SHIP_LOG) return prev; // cap at 5
      return { ...prev, shipLog: [...prev.shipLog, id] };
    });
  };

  const setList = (key: 'integrations' | 'aiPhase1' | 'aiPhase2', next: string[]) => {
    setData((prev) => ({ ...prev, [key]: next }));
  };

  const totals = useMemo(
    () => ({
      annual: data.oneTimeTotalCentavos + data.monthlyRetainerCentavos * 12,
    }),
    [data.oneTimeTotalCentavos, data.monthlyRetainerCentavos],
  );

  const pesoFromCentavos = (c: number) => Math.round(c / 100);

  return (
    <div className="proposal-maker-root space-y-6">
      {/* Tabs */}
      <div className="proposal-no-print -mx-4 border-b border-slate-200 bg-white px-4 sm:-mx-6 sm:px-6">
        <nav className="flex gap-1 text-[13px]">
          <Link
            href="/admin/proposals"
            className="rounded-t-md border-b-2 border-transparent px-3 py-2.5 font-medium text-slate-500 transition hover:text-slate-900"
          >
            All proposals
          </Link>
          <span className="rounded-t-md border-b-2 border-cyan-600 px-3 py-2.5 font-semibold text-cyan-700">
            {proposalId ? 'Editor' : 'New proposal'}
          </span>
        </nav>
      </div>

      {/* Action bar */}
      <div className="proposal-no-print sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#F5F7FB]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Proposal Maker</h1>
          <p className="text-[12px] text-slate-500">
            BossLabs Project Proposal — fill the form, preview live, download as PDF.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {savedAt && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
              Saved
            </span>
          )}
          <button
            type="button"
            onClick={() => setData(DEFAULT_PROPOSAL_FORM)}
            className="rounded-full border border-slate-300 px-4 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-white"
          >
            Reset form
          </button>
          <button
            type="button"
            onClick={saveProposal}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-600 px-5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-wait disabled:opacity-70"
          >
            {saving ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" className="animate-spin" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                Saving…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="17 21 17 13 7 13 7 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="7 3 7 8 15 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {proposalId ? 'Save changes' : 'Save proposal'}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={downloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70"
          >
            {downloading ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" className="animate-spin" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                Generating PDF…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Download PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Link to customer — top of the form so it's the first decision. */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">
            Linked customer <span className="text-[12px] font-normal text-slate-400">(optional)</span>
          </h2>
          {linked && (
            <a
              href={`/admin/customers/${linked.signupId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-medium text-cyan-700 hover:underline"
            >
              Open profile ↗
            </a>
          )}
        </div>
        <p className="mb-3 text-[12px] text-slate-500">
          Link this proposal to an existing customer so it shows on their profile.
        </p>
        <CustomerLinkPicker linked={linked} onPick={setLinked} />
      </section>

      {/* Mobile tab switcher — visible <lg. Side-by-side on lg+. */}
      <div className="proposal-no-print -mt-2 flex gap-1 rounded-full bg-slate-200/70 p-1 text-[12.5px] font-semibold lg:hidden">
        <button
          type="button"
          onClick={() => setMobileView('edit')}
          className={`flex-1 rounded-full px-3 py-1.5 transition ${
            mobileView === 'edit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          ✏️ Edit
        </button>
        <button
          type="button"
          onClick={() => setMobileView('preview')}
          className={`flex-1 rounded-full px-3 py-1.5 transition ${
            mobileView === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          📄 Preview
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(360px,440px),1fr]">
        {/* FORM */}
        <form className={`proposal-no-print space-y-5 ${mobileView === 'edit' ? '' : 'hidden lg:block'}`}>
          {/* Client */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Client</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>Company name *</label>
                <input
                  type="text"
                  value={data.clientCompanyName}
                  onChange={(e) => setData({ ...data, clientCompanyName: e.target.value })}
                  className={inputCls}
                  placeholder="NextDrive Company"
                />
              </div>
              <div>
                <label className={labelCls}>Contact name *</label>
                <input
                  type="text"
                  value={data.clientRepName}
                  onChange={(e) => setData({ ...data, clientRepName: e.target.value })}
                  className={inputCls}
                  placeholder="Maria Santos"
                />
              </div>
              <div>
                <label className={labelCls}>Title / position</label>
                <input
                  type="text"
                  value={data.clientRepPosition}
                  onChange={(e) => setData({ ...data, clientRepPosition: e.target.value })}
                  className={inputCls}
                  placeholder="Owner"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Address</label>
                <input
                  type="text"
                  value={data.clientAddress}
                  onChange={(e) => setData({ ...data, clientAddress: e.target.value })}
                  className={inputCls}
                  placeholder="1234 Sample St., Makati City"
                />
              </div>
            </div>
          </section>

          {/* Platform & proposal meta */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Platform &amp; proposal</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>Platform name *</label>
                <input
                  type="text"
                  value={data.platformName}
                  onChange={(e) => setData({ ...data, platformName: e.target.value })}
                  className={inputCls}
                  placeholder="NextDrive Command Center"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Client vision (quoted in the summary)</label>
                <textarea
                  value={data.clientVision}
                  onChange={(e) => setData({ ...data, clientVision: e.target.value })}
                  className={`${inputCls} min-h-[80px] resize-y`}
                  placeholder="In their words: what they want the platform to do for the business."
                />
              </div>
              <div>
                <label className={labelCls}>Proposal date</label>
                <input
                  type="date"
                  value={data.proposalDate}
                  onChange={(e) => setData({ ...data, proposalDate: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Valid for (days)</label>
                <input
                  type="number"
                  min={1}
                  value={data.validityDays}
                  onChange={(e) => setData({ ...data, validityDays: Math.max(1, Math.round(Number(e.target.value) || 0)) })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Kick-off date (drives timeline)</label>
                <input
                  type="date"
                  value={data.kickoffDate}
                  onChange={(e) => setData({ ...data, kickoffDate: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Proposal No. (auto)</label>
                <input
                  type="text"
                  value={data.proposalNo || 'Assigned on save'}
                  readOnly
                  className={`${inputCls} bg-slate-50 text-slate-500`}
                />
              </div>
            </div>
          </section>

          {/* Service option */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Service option</h2>
            <p className="mb-3 text-[12px] text-slate-500">
              Picking an option auto-fills the investment figures below. Edit them freely after.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PROPOSAL_OPTIONS.map((opt) => {
                const active = data.optionId === opt.id;
                const tight = opt.id === 'A' ? 'Standard' : opt.id === 'B' ? 'Hardened' : 'Hardened + VAPT';
                const eta = opt.id === 'A' ? '~30 days' : opt.id === 'B' ? '1–2 mo' : '4–6 mo';
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => pickOption(opt.id)}
                    className={`flex flex-col rounded-xl border p-2.5 text-left transition ${
                      active
                        ? 'border-cyan-400 bg-cyan-50 shadow-[0_0_0_3px_rgba(34,211,238,0.2)]'
                        : 'border-slate-200 bg-white hover:border-slate-400'
                    }`}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Option {opt.id}</div>
                    <div className="mt-0.5 text-[13px] font-semibold leading-tight text-slate-900">{tight}</div>
                    <div className="mt-0.5 text-[10.5px] text-slate-500">{eta}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Investment */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Investment</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <PesoField
                label="One-time build (₱)"
                centavos={data.oneTimeTotalCentavos}
                step={5000}
                onChange={(c) => setData({ ...data, oneTimeTotalCentavos: c })}
              />
              <PesoField
                label="Monthly retainer (₱/mo)"
                centavos={data.monthlyRetainerCentavos}
                step={1000}
                onChange={(c) => setData({ ...data, monthlyRetainerCentavos: c })}
              />
              <div>
                <label className={labelCls}>Min. retainer (months)</label>
                <input
                  type="number"
                  min={1}
                  value={data.minRetainerMonths}
                  onChange={(e) => setData({ ...data, minRetainerMonths: Math.max(1, Math.round(Number(e.target.value) || 0)) })}
                  className={inputCls}
                />
              </div>
              <PesoField
                label="Exit / full handover (₱)"
                centavos={data.exitFeeCentavos}
                step={5000}
                onChange={(c) => setData({ ...data, exitFeeCentavos: c })}
              />
            </div>
            <div className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-[12px]">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Projected first-year value</span>
              <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
                ₱{pesoFromCentavos(totals.annual).toLocaleString('en-PH')}{' '}
                <span className="text-[11px] font-normal text-slate-500">(one-time + 12 mo)</span>
              </div>
            </div>
          </section>

          {/* Scope modules */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-slate-900">Scope modules</h2>
              <button type="button" onClick={addModule} className="text-[12px] font-semibold text-cyan-700 hover:underline">
                + Add module
              </button>
            </div>
            <div className="space-y-3">
              {data.modules.map((m, idx) => (
                <div key={m.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex-none rounded-md bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 tabular-nums">
                      #{idx + 1}
                    </span>
                    <input
                      type="text"
                      value={m.name}
                      onChange={(e) => updateModule(m.id, { name: e.target.value })}
                      className={inputCls}
                      placeholder="Module name (e.g. Dashboard & Reporting)"
                    />
                    <button
                      type="button"
                      onClick={() => removeModule(m.id)}
                      aria-label={`Remove ${m.name || 'module'}`}
                      className="flex-none rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={m.features}
                    onChange={(e) => updateModule(m.id, { features: e.target.value })}
                    className={`${inputCls} mt-2 text-[12.5px]`}
                    placeholder="Key features"
                  />
                  <input
                    type="text"
                    value={m.roles}
                    onChange={(e) => updateModule(m.id, { roles: e.target.value })}
                    className={`${inputCls} mt-2 text-[12.5px]`}
                    placeholder="Users / roles (e.g. Owner, Staff)"
                  />
                </div>
              ))}
              {data.modules.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-[12px] text-slate-400">
                  No modules yet. Add the platform&apos;s modules for the scope table.
                </div>
              )}
            </div>
          </section>

          {/* Integrations */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Integrations</h2>
            <ChecklistEditor
              bank={INTEGRATION_BANK}
              selected={data.integrations}
              onChange={(next) => setList('integrations', next)}
              addPlaceholder="Add another integration…"
            />
          </section>

          {/* AI Phase 1 / Phase 2 */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-base font-semibold text-slate-900">AI — Phase 1 (included)</h2>
            <p className="mb-3 text-[12px] text-slate-500">Ships with the build.</p>
            <ChecklistEditor
              bank={AI_PHASE1_BANK}
              selected={data.aiPhase1}
              onChange={(next) => setList('aiPhase1', next)}
              addPlaceholder="Add a Phase 1 AI capability…"
            />
            <hr className="my-4 border-slate-200" />
            <h2 className="mb-1 text-base font-semibold text-slate-900">AI — Phase 2 (future)</h2>
            <p className="mb-3 text-[12px] text-slate-500">Roadmap, quoted separately.</p>
            <ChecklistEditor
              bank={AI_PHASE2_BANK}
              selected={data.aiPhase2}
              onChange={(next) => setList('aiPhase2', next)}
              addPlaceholder="Add a Phase 2 AI upgrade…"
            />
          </section>

          {/* Ship Log */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-slate-900">Ship Log</h2>
              <span className="text-[11px] text-slate-400">{data.shipLog.length} selected · pick 3–5</span>
            </div>
            <p className="mb-3 text-[12px] text-slate-500">Case studies shown in the About section.</p>
            <div className="space-y-2">
              {SHIP_LOG_BANK.map((s) => {
                const checked = data.shipLog.includes(s.id);
                const disabled = !checked && data.shipLog.length >= MAX_SHIP_LOG;
                return (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition ${
                      checked ? 'border-cyan-300 bg-cyan-50/60' : 'border-slate-200 hover:border-slate-300'
                    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleShipLog(s.id)}
                      className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-400 text-cyan-600 focus:ring-cyan-400"
                    />
                    <span className="flex-1">
                      <span className="text-[13px] font-semibold text-slate-800">{s.industry}</span>
                      <span className="mt-0.5 block text-[11.5px] text-slate-500">{s.descriptor}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          {/* Timeline durations */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-base font-semibold text-slate-900">Timeline durations</h2>
            <p className="mb-3 text-[12px] text-slate-500">Days per phase — dates auto-compute from the kick-off date.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <DayField label="Onboarding" value={data.onboardingDays} onChange={(v) => setData({ ...data, onboardingDays: v })} />
              <DayField label="Workflow building" value={data.workflowDays} onChange={(v) => setData({ ...data, workflowDays: v })} />
              <DayField label="MVP build" value={data.mvpDays} onChange={(v) => setData({ ...data, mvpDays: v })} />
              <DayField label="Data migration" value={data.dataMigrationDays} onChange={(v) => setData({ ...data, dataMigrationDays: v })} />
              <DayField label="Implementation (UAT inside)" value={data.implementationDays} onChange={(v) => setData({ ...data, implementationDays: v })} />
            </div>
          </section>

          {/* Support */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Training &amp; support</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Warranty (days)</label>
                <input
                  type="number"
                  min={0}
                  value={data.warrantyDays}
                  onChange={(e) => setData({ ...data, warrantyDays: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Training sessions</label>
                <input
                  type="number"
                  min={0}
                  value={data.trainingSessions}
                  onChange={(e) => setData({ ...data, trainingSessions: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Training mode</label>
                <select
                  value={data.trainingMode}
                  onChange={(e) => setData({ ...data, trainingMode: e.target.value as ProposalFormData['trainingMode'] })}
                  className={inputCls}
                >
                  <option value="on-site">On-site</option>
                  <option value="online">Online</option>
                  <option value="either">Either (client preference)</option>
                </select>
              </div>
            </div>
          </section>
        </form>

        {/* PREVIEW */}
        <section className={`proposal-preview-section ${mobileView === 'preview' ? '' : 'hidden lg:block'}`}>
          <div className="proposal-no-print mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-500">
            <span className="truncate">Live preview · what the PDF will look like</span>
            <span>Option {data.optionId}</span>
          </div>
          <div className="proposal-page-frame">
            <div ref={pageRef} className="proposal-page">
              <ProposalDocument data={data} />
            </div>
          </div>
        </section>
      </div>

      {/* Print-friendly CSS — mirrors the Contract Maker. Only the proposal
          page is visible when printing, rendered at exact A4. On screen the
          210mm page sits inside a scrollable frame so it stays readable on
          phones. The dark cover keeps its background in print + PDF via
          print-color-adjust. */}
      <style jsx global>{`
        .proposal-maker-root,
        .proposal-maker-root input,
        .proposal-maker-root select,
        .proposal-maker-root textarea,
        .proposal-maker-root button {
          font-family: Arial, Helvetica, sans-serif !important;
        }
        .proposal-page-frame {
          background: #e5e7eb;
          padding: 14px;
          border-radius: 12px;
          max-width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .proposal-page {
          background: white;
          color: black;
          width: 210mm;
          min-height: 297mm;
          padding: 18mm 16mm;
          margin: 0 auto;
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.18);
          font-family: Arial, Helvetica, sans-serif !important;
        }
        .proposal-page * {
          font-family: Arial, Helvetica, sans-serif !important;
        }
        .proposal-cover {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        @media print {
          @page { size: A4; margin: 18mm 16mm; }
          html, body { background: white !important; }
          .proposal-no-print { display: none !important; }
          .admin-shell aside, .admin-shell header { display: none !important; }
          .proposal-preview-section { display: block !important; }
          .proposal-page-frame {
            background: none !important;
            padding: 0 !important;
            border: 0 !important;
            overflow: visible !important;
          }
          .proposal-page {
            width: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            zoom: 1 !important;
          }
        }
      `}</style>
    </div>
  );
}

/** A ₱ amount input backed by a centavos value. Shows pesos, stores centavos. */
function PesoField({
  label,
  centavos,
  step,
  onChange,
}: {
  label: string;
  centavos: number;
  step: number;
  onChange: (centavos: number) => void;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] font-semibold text-slate-400">₱</span>
        <input
          type="number"
          min={0}
          step={step}
          value={Math.round(centavos / 100)}
          onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)) * 100)}
          className={`${inputCls} pl-6 text-right tabular-nums`}
          placeholder="0"
        />
      </div>
    </div>
  );
}

/** A day-count input (min 1). */
function DayField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.round(Number(e.target.value) || 0)))}
        className={inputCls}
      />
    </div>
  );
}

/** Checkbox list over a preset bank + a free-text adder. Selected items not in
 *  the bank render as removable chips so custom additions can be cleared. */
function ChecklistEditor({
  bank,
  selected,
  onChange,
  addPlaceholder,
}: {
  bank: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  addPlaceholder: string;
}) {
  const [draft, setDraft] = useState('');
  const toggle = (item: string) => {
    if (selected.includes(item)) onChange(selected.filter((s) => s !== item));
    else onChange([...selected, item]);
  };
  const add = () => {
    const v = draft.trim();
    if (!v || selected.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...selected, v]);
    setDraft('');
  };
  const custom = selected.filter((s) => !bank.includes(s));

  return (
    <div>
      <div className="space-y-1.5">
        {bank.map((item) => {
          const checked = selected.includes(item);
          return (
            <label key={item} className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(item)}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-400 text-cyan-600 focus:ring-cyan-400"
              />
              <span className="text-[12.5px] text-slate-700">{item}</span>
            </label>
          );
        })}
      </div>

      {custom.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {custom.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 text-[11.5px] font-medium text-cyan-800"
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(selected.filter((s) => s !== item))}
                aria-label={`Remove ${item}`}
                className="text-cyan-500 hover:text-cyan-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className={`${inputCls} text-[12.5px]`}
          placeholder={addPlaceholder}
        />
        <button
          type="button"
          onClick={add}
          className="flex-none rounded-lg border border-slate-300 px-3 py-2 text-[12.5px] font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
