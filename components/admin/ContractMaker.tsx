'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CONTRACT_OPTIONS,
  DEFAULT_CONTRACT_FORM,
  findOption,
  newCustomLineItem,
  type ContractFormData,
  type ContractLineItem,
} from '@/lib/contract-defaults';
import { ContractDocument } from './ContractDocument';
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

export function ContractMaker({
  initial,
  contractId: initialContractId,
  initialLinked,
}: {
  /** Pre-fill the form (for /admin/contracts/[id] edit mode). Defaults
   *  to the blank DEFAULT_CONTRACT_FORM. */
  initial?: ContractFormData;
  /** When set, Save sends PATCH /api/admin/contracts/[id]. When undefined,
   *  Save sends POST /api/admin/contracts and then router.pushes to the
   *  new contract's edit URL. */
  contractId?: string;
  /** Pre-link a customer (so the "Linked customer" chip is filled on
   *  edit mode). */
  initialLinked?: LinkedCustomer | null;
} = {}) {
  const router = useRouter();
  const [data, setData] = useState<ContractFormData>(initial ?? DEFAULT_CONTRACT_FORM);
  const [contractId, setContractId] = useState<string | null>(initialContractId ?? null);
  const [linked, setLinked] = useState<LinkedCustomer | null>(initialLinked ?? null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Mobile tab — desktop shows both panes side-by-side; small screens swap
  // between "Edit" and "Preview" so the preview is readable at full width.
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');

  async function saveContract() {
    if (saving) return;
    if (!data.clientCompanyName.trim()) {
      window.alert('Add a client company name before saving.');
      return;
    }
    setSaving(true);
    try {
      const body = { ...data, signupId: linked?.signupId ?? null };
      const url = contractId ? `/api/admin/contracts/${contractId}` : '/api/admin/contracts';
      const method = contractId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { contract?: { id: string }; error?: string };
      if (!res.ok || !json.contract) {
        throw new Error(json.error || `Save failed (${res.status})`);
      }
      setSavedAt(Date.now());
      // First save → URL changes from /new → /[id] so refreshes preserve state.
      if (!contractId) {
        setContractId(json.contract.id);
        router.push(`/admin/contracts/${json.contract.id}`);
      }
    } catch (err) {
      console.error('[contract] save failed', err);
      window.alert(err instanceof Error ? err.message : 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  }
  // PDF download state — disables the button + shows progress while
  // html2pdf renders. Async because html2pdf is dynamically imported (it
  // touches `window` at module load, would break SSR).
  const [downloading, setDownloading] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  async function downloadPdf() {
    const el = pageRef.current;
    if (!el || downloading) return;
    setDownloading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const client = safeFilenameSegment(data.clientCompanyName, 'Client');
      const filename = `BossLabs-Agreement-${client}-${today}.pdf`;
      // Dynamic import — html2pdf reads `window` at the top of its module.
      const html2pdfMod = await import('html2pdf.js');
      const html2pdf = (html2pdfMod.default ?? html2pdfMod) as (() => {
        set: (opts: Record<string, unknown>) => { from: (el: HTMLElement) => { save: () => Promise<void> } };
      });
      await html2pdf()
        .set({
          filename,
          // No outer margin — the .contract-page element is already 210mm
          // wide (full A4) with its own 18mm/16mm internal padding for the
          // visual margins. Adding html2pdf margin on top would force the
          // 210mm-wide canvas into a smaller content area, clipping the
          // right edge of the letterhead and the body copy.
          margin: 0,
          image: { type: 'jpeg', quality: 0.96 },
          // windowWidth pins the canvas viewport to the page's render
          // width in pixels so html2canvas captures the same layout the
          // user sees in the preview, not whatever fluid layout the
          // current scroll position happens to produce.
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 794 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          // Avoid splitting tables/sections across pages where html2pdf can
          // detect a clean break; falls back to CSS page-break-* and legacy.
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        })
        .from(el)
        .save();
    } catch (err) {
      console.error('[contract] PDF download failed', err);
      window.alert('Sorry, the PDF could not be generated. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  const pickOption = (id: ContractFormData['optionId']) => {
    const opt = findOption(id);
    // Reset line items to the picked option's defaults so the user gets a clean slate.
    setData((prev) => ({ ...prev, optionId: id, lineItems: opt.lineItems.map((li) => ({ ...li })) }));
  };

  const updateLineItem = (id: string, patch: Partial<ContractLineItem>) => {
    setData((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((li) => (li.id === id ? { ...li, ...patch } : li)),
    }));
  };

  const removeLineItem = (id: string) => {
    setData((prev) => ({ ...prev, lineItems: prev.lineItems.filter((li) => li.id !== id) }));
  };

  const addLineItem = () => {
    setData((prev) => ({ ...prev, lineItems: [...prev.lineItems, newCustomLineItem()] }));
  };

  const totals = useMemo(() => {
    const oneTime = data.lineItems.filter((li) => li.kind === 'oneTime').reduce((s, li) => s + li.amountCentavos, 0);
    const monthly = data.lineItems.filter((li) => li.kind === 'monthly').reduce((s, li) => s + li.amountCentavos, 0);
    return { oneTime, monthly };
  }, [data.lineItems]);

  return (
    <div className="contract-maker-root space-y-6">
      {/* Tabs */}
      <div className="contract-no-print -mx-4 border-b border-slate-200 bg-white px-4 sm:-mx-6 sm:px-6">
        <nav className="flex gap-1 text-[13px]">
          <Link
            href="/admin/contracts"
            className="rounded-t-md border-b-2 border-transparent px-3 py-2.5 font-medium text-slate-500 transition hover:text-slate-900"
          >
            All contracts
          </Link>
          <span className="rounded-t-md border-b-2 border-cyan-600 px-3 py-2.5 font-semibold text-cyan-700">
            {contractId ? 'Editor' : 'New contract'}
          </span>
        </nav>
      </div>

      {/* Action bar */}
      <div className="contract-no-print sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#F5F7FB]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Contract Maker</h1>
          <p className="text-[12px] text-slate-500">
            BossLabs Web Development &amp; Services Agreement — fill the form, preview live, print to PDF.
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
            onClick={() => setData(DEFAULT_CONTRACT_FORM)}
            className="rounded-full border border-slate-300 px-4 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-white"
          >
            Reset form
          </button>
          <button
            type="button"
            onClick={saveContract}
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
                {contractId ? 'Save changes' : 'Save contract'}
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
          <h2 className="text-base font-semibold text-slate-900">Linked customer <span className="text-[12px] font-normal text-slate-400">(optional)</span></h2>
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
          Link this contract to an existing customer so it rolls into their LTV on the customer profile.
        </p>
        <CustomerLinkPicker linked={linked} onPick={setLinked} />
      </section>

      {/* Mobile tab switcher — visible <lg. Side-by-side on lg+. */}
      <div className="contract-no-print -mt-2 flex gap-1 rounded-full bg-slate-200/70 p-1 text-[12.5px] font-semibold lg:hidden">
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

      <div className="grid gap-6 lg:grid-cols-[minmax(360px,420px),1fr]">
        {/* FORM */}
        <form className={`contract-no-print space-y-5 ${mobileView === 'edit' ? '' : 'hidden lg:block'}`}>
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
                <label className={labelCls}>Signatory name *</label>
                <input
                  type="text"
                  value={data.clientRepName}
                  onChange={(e) => setData({ ...data, clientRepName: e.target.value })}
                  className={inputCls}
                  placeholder="Maria Santos"
                />
              </div>
              <div>
                <label className={labelCls}>Position *</label>
                <input
                  type="text"
                  value={data.clientRepPosition}
                  onChange={(e) => setData({ ...data, clientRepPosition: e.target.value })}
                  className={inputCls}
                  placeholder="Owner"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Principal office address</label>
                <input
                  type="text"
                  value={data.clientAddress}
                  onChange={(e) => setData({ ...data, clientAddress: e.target.value })}
                  className={inputCls}
                  placeholder="1234 Sample St., Makati City"
                />
              </div>
              <div>
                <label className={labelCls}>Effective date</label>
                <input
                  type="date"
                  value={data.effectiveDate}
                  onChange={(e) => setData({ ...data, effectiveDate: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Governing-law venue (city)</label>
                <input
                  type="text"
                  value={data.governingVenue}
                  onChange={(e) => setData({ ...data, governingVenue: e.target.value })}
                  className={inputCls}
                  placeholder="Imus, Cavite"
                />
              </div>
            </div>

            {/* Downpayment toggle — controls whether the contract document
                emits a downpayment clause on the One-Time Fees. Off = client
                pays the full one-time amount on first invoice per §3.4. */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={data.requiresDownpayment}
                  onChange={(e) => setData({ ...data, requiresDownpayment: e.target.checked })}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-400 text-cyan-600 focus:ring-cyan-400"
                />
                <span className="flex-1">
                  <span className="text-[13px] font-semibold text-slate-800">
                    Require a downpayment on One-Time Fees
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-slate-500">
                    Adds a clause: Client pays N% on signing, remainder due on delivery. Uncheck if you want full payment due on invoice.
                  </span>
                </span>
              </label>
              {data.requiresDownpayment && (
                <div className="mt-3 space-y-2.5">
                  {/* Mode picker: percent of one-time fees vs fixed ₱ amount. */}
                  <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-[12px] font-medium">
                    <button
                      type="button"
                      onClick={() => setData({ ...data, downpaymentMode: 'percent' })}
                      className={`rounded-md px-3 py-1.5 transition ${
                        data.downpaymentMode === 'percent'
                          ? 'bg-cyan-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Percentage
                    </button>
                    <button
                      type="button"
                      onClick={() => setData({ ...data, downpaymentMode: 'fixed' })}
                      className={`rounded-md px-3 py-1.5 transition ${
                        data.downpaymentMode === 'fixed'
                          ? 'bg-cyan-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Fixed amount
                    </button>
                  </div>
                  {data.downpaymentMode === 'percent' ? (
                    <div className="flex items-center gap-2">
                      <label className="text-[12px] font-medium text-slate-600">Downpayment %</label>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={data.downpaymentPercent}
                        onChange={(e) =>
                          setData({
                            ...data,
                            downpaymentPercent: Math.min(99, Math.max(1, Math.round(Number(e.target.value) || 0))),
                          })
                        }
                        className={`${inputCls} w-20`}
                      />
                      <span className="text-[12px] text-slate-500">
                        upfront · {Math.max(1, 100 - data.downpaymentPercent)}% on delivery
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <label className="text-[12px] font-medium text-slate-600">Downpayment ₱</label>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={Math.round(data.downpaymentFixedCentavos / 100)}
                        onChange={(e) =>
                          setData({
                            ...data,
                            downpaymentFixedCentavos: Math.max(0, Math.round(Number(e.target.value) || 0)) * 100,
                          })
                        }
                        className={`${inputCls} w-32`}
                      />
                      <span className="text-[12px] text-slate-500">upfront · remainder on delivery</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Service option</h2>
            <p className="mb-3 text-[12px] text-slate-500">
              Picking an option resets the line items to that option&apos;s defaults. Edit/remove freely after.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {CONTRACT_OPTIONS.map((opt) => {
                const active = data.optionId === opt.id;
                // Tight names so 3 cards fit horizontally on a narrow form
                // column without wrapping into 3 lines.
                const tight =
                  opt.id === 'A' ? 'Standard' :
                  opt.id === 'B' ? 'Hardened' :
                  'Hardened + VAPT';
                const eta =
                  opt.id === 'A' ? '~30 days' :
                  opt.id === 'B' ? '1–2 mo' :
                  '4–6 mo';
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
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Option {opt.id}
                    </div>
                    <div className="mt-0.5 text-[13px] font-semibold leading-tight text-slate-900">{tight}</div>
                    <div className="mt-0.5 text-[10.5px] text-slate-500">{eta}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-slate-900">Line items</h2>
              <button
                type="button"
                onClick={addLineItem}
                className="text-[12px] font-semibold text-cyan-700 hover:underline"
              >
                + Add line item
              </button>
            </div>
            <div className="space-y-3">
              {data.lineItems.map((li, idx) => (
                <div key={li.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {/* Row 1: # · label · remove. Label gets full width so long
                      deliverable names don't get clipped by the amount/kind cells. */}
                  <div className="flex items-center gap-2">
                    <span className="flex-none rounded-md bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 tabular-nums">
                      #{idx + 1}
                    </span>
                    <label className="sr-only" htmlFor={`li-label-${li.id}`}>Item label</label>
                    <input
                      id={`li-label-${li.id}`}
                      type="text"
                      value={li.label}
                      onChange={(e) => updateLineItem(li.id, { label: e.target.value })}
                      className={inputCls}
                      placeholder="Deliverable / item label"
                    />
                    <button
                      type="button"
                      onClick={() => removeLineItem(li.id)}
                      aria-label={`Remove ${li.label || 'line item'}`}
                      className="flex-none rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  {/* Row 2: amount + kind side by side, full width split. */}
                  <div className="mt-2 grid gap-2 grid-cols-[1fr,120px]">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] font-semibold text-slate-400">₱</span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={(li.amountCentavos / 100).toString()}
                        onChange={(e) =>
                          updateLineItem(li.id, {
                            amountCentavos: Math.max(0, Math.round(parseFloat(e.target.value || '0') * 100)),
                          })
                        }
                        className={`${inputCls} pl-6 text-right tabular-nums`}
                        placeholder="0"
                      />
                    </div>
                    <select
                      value={li.kind}
                      onChange={(e) => updateLineItem(li.id, { kind: e.target.value as ContractLineItem['kind'] })}
                      className={inputCls}
                    >
                      <option value="oneTime">One-time</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  {/* Row 3: full-width note */}
                  <input
                    type="text"
                    value={li.note ?? ''}
                    onChange={(e) => updateLineItem(li.id, { note: e.target.value })}
                    className={`${inputCls} mt-2 text-[12.5px]`}
                    placeholder="Payment note (optional) — e.g. 50% on signing, 50% on delivery"
                  />
                </div>
              ))}
              {data.lineItems.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-[12px] text-slate-400">
                  No line items. Pick an option above or add one manually.
                </div>
              )}
            </div>
            <div className="mt-4 grid gap-2 text-[13px] sm:grid-cols-2">
              <div className="rounded-lg bg-slate-100 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">One-time total</div>
                <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
                  ₱{(totals.oneTime / 100).toLocaleString('en-PH')}
                </div>
              </div>
              <div className="rounded-lg bg-slate-100 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Monthly total</div>
                <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
                  ₱{(totals.monthly / 100).toLocaleString('en-PH')} <span className="text-[11px] font-normal text-slate-500">/mo</span>
                </div>
              </div>
            </div>
          </section>
        </form>

        {/* PREVIEW — the `contract-preview-section` class lets the print CSS
            force-show this even when mobileView==='edit' (`hidden` is applied);
            otherwise tapping Print on the Edit tab on mobile produces a blank PDF. */}
        <section className={`contract-preview-section ${mobileView === 'preview' ? '' : 'hidden lg:block'}`}>
          <div className="contract-no-print mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-500">
            <span className="truncate">Live preview · what the PDF will look like</span>
            <span>Option {data.optionId}</span>
          </div>
          {/* Scrollable frame on small screens so the 210mm page stays readable
              without forcing the whole admin chrome to grow horizontally. */}
          <div className="contract-page-frame">
            <div ref={pageRef} className="contract-page">
              <ContractDocument data={data} />
            </div>
          </div>
        </section>
      </div>

      {/* Print-friendly CSS — only the contract page is visible when printing,
          rendered at exact A4 with 18mm/16mm margins. On screen, the 210mm
          page is shown inside a scrollable frame so it stays readable on
          phones without resizing everything. */}
      <style jsx global>{`
        /* Arial across the whole Contract Maker — form UI AND the printed
           contract document. User asked for basic, universal fonts; Arial
           is installed on every device and prints cleanly. */
        .contract-maker-root,
        .contract-maker-root input,
        .contract-maker-root select,
        .contract-maker-root textarea,
        .contract-maker-root button {
          font-family: Arial, Helvetica, sans-serif !important;
        }
        /* Frame is a horizontal-scroll container. The contract page is
           fixed at 210mm; if the column is narrower (mobile or with
           browser zoom on), the frame scrolls horizontally instead of
           clipping the right edge. The previous CSS-zoom approach
           stacked unpredictably with browser zoom and clipped pages. */
        .contract-page-frame {
          background: #e5e7eb;
          padding: 14px;
          border-radius: 12px;
          max-width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .contract-page {
          background: white;
          color: black;
          width: 210mm;
          min-height: 297mm;
          padding: 18mm 16mm;
          margin: 0 auto;
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.18);
          /* Arial overrides the serif stack inside ContractDocument so the
             printed page matches what the user sees in the form preview. */
          font-family: Arial, Helvetica, sans-serif !important;
        }
        .contract-page * {
          font-family: Arial, Helvetica, sans-serif !important;
        }
        @media print {
          @page { size: A4; margin: 18mm 16mm; }
          html, body { background: white !important; }
          .contract-no-print { display: none !important; }
          .admin-shell aside, .admin-shell header { display: none !important; }
          /* Override Tailwind's .hidden on the preview section so the
             contract document prints even when the user tapped Print from
             the mobile Edit tab. Without this, the section stays
             display:none during print → blank PDF. */
          .contract-preview-section { display: block !important; }
          .contract-page-frame {
            background: none !important;
            padding: 0 !important;
            border: 0 !important;
            overflow: visible !important;
          }
          .contract-page {
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
