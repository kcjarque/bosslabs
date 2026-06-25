'use client';

import { useMemo, useState } from 'react';
import {
  CONTRACT_OPTIONS,
  DEFAULT_CONTRACT_FORM,
  findOption,
  newCustomLineItem,
  type ContractFormData,
  type ContractLineItem,
} from '@/lib/contract-defaults';
import { ContractDocument } from './ContractDocument';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200';
const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-600';

export function ContractMaker() {
  const [data, setData] = useState<ContractFormData>(DEFAULT_CONTRACT_FORM);

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
    <div className="space-y-6">
      {/* Action bar */}
      <div className="contract-no-print sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#F5F7FB]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Contract Maker</h1>
          <p className="text-[12px] text-slate-500">
            BossLabs Web Development &amp; Services Agreement — fill the form, preview live, print to PDF.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setData(DEFAULT_CONTRACT_FORM)}
            className="rounded-full border border-slate-300 px-4 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-white"
          >
            Reset form
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            🖨 Print to PDF
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px,1fr]">
        {/* FORM */}
        <form className="contract-no-print space-y-5">
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
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Service option</h2>
            <p className="mb-3 text-[12px] text-slate-500">
              Picking an option resets the line items to that option&apos;s defaults. Edit/remove freely after.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {CONTRACT_OPTIONS.map((opt) => {
                const active = data.optionId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => pickOption(opt.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-cyan-400 bg-cyan-50 shadow-[0_0_0_3px_rgba(34,211,238,0.2)]'
                        : 'border-slate-200 bg-white hover:border-slate-400'
                    }`}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Option {opt.id}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-slate-900">{opt.name.replace(/^Option [A-C] — /, '')}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{opt.targetTimeline}</div>
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
              {data.lineItems.map((li) => (
                <div key={li.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr,140px,110px,28px]">
                    <input
                      type="text"
                      value={li.label}
                      onChange={(e) => updateLineItem(li.id, { label: e.target.value })}
                      className={inputCls}
                      placeholder="Deliverable / item label"
                    />
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
                      className={`${inputCls} text-right tabular-nums`}
                      placeholder="₱ amount"
                    />
                    <select
                      value={li.kind}
                      onChange={(e) => updateLineItem(li.id, { kind: e.target.value as ContractLineItem['kind'] })}
                      className={inputCls}
                    >
                      <option value="oneTime">One-time</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeLineItem(li.id)}
                      aria-label="Remove line item"
                      className="rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    type="text"
                    value={li.note ?? ''}
                    onChange={(e) => updateLineItem(li.id, { note: e.target.value })}
                    className={`${inputCls} mt-2 text-[12px]`}
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

        {/* PREVIEW */}
        <section>
          <div className="contract-no-print mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-500">
            <span>Live preview · this is exactly what the PDF will look like</span>
            <span>{data.optionId === 'A' ? 'Option A' : data.optionId === 'B' ? 'Option B' : 'Option C'}</span>
          </div>
          <div className="contract-page-frame">
            <div className="contract-page">
              <ContractDocument data={data} />
            </div>
          </div>
        </section>
      </div>

      {/* Print-friendly CSS — only the contract page is visible when printing,
          rendered at exact A4/Letter size with 1in margins. */}
      <style jsx global>{`
        .contract-page-frame {
          background: #e5e7eb;
          padding: 16px;
          border-radius: 12px;
        }
        .contract-page {
          background: white;
          color: black;
          width: 210mm;
          min-height: 297mm;
          padding: 22mm 20mm;
          margin: 0 auto;
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.18);
          font-family: 'Times New Roman', Georgia, serif;
        }
        @media print {
          @page { size: A4; margin: 18mm 16mm; }
          html, body { background: white !important; }
          .contract-no-print { display: none !important; }
          .admin-shell aside, .admin-shell header { display: none !important; }
          .contract-page-frame { background: none !important; padding: 0 !important; border: 0 !important; }
          .contract-page {
            width: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
