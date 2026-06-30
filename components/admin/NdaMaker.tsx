'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DEFAULT_NDA_FORM, type NdaFormData } from '@/lib/nda-defaults';
import { NdaDocument } from './NdaDocument';
import { CustomerLinkPicker, type LinkedCustomer } from './CustomerLinkPicker';

function safeFilenameSegment(s: string, fallback = 'Counterparty'): string {
  const cleaned = s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  return cleaned.length > 0 ? cleaned.slice(0, 60) : fallback;
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200';
const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-600';

export function NdaMaker({
  initial,
  ndaId: initialNdaId,
  initialLinked,
}: {
  initial?: NdaFormData;
  ndaId?: string;
  initialLinked?: LinkedCustomer | null;
} = {}) {
  const router = useRouter();
  const [data, setData] = useState<NdaFormData>(initial ?? DEFAULT_NDA_FORM);
  const [ndaId, setNdaId] = useState<string | null>(initialNdaId ?? null);
  const [linked, setLinked] = useState<LinkedCustomer | null>(initialLinked ?? null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const pageRef = useRef<HTMLDivElement>(null);

  async function saveNda() {
    if (saving) return;
    if (!data.counterpartyCompanyName.trim()) {
      window.alert('Add a counterparty company name before saving.');
      return;
    }
    setSaving(true);
    try {
      const body = { ...data, signupId: linked?.signupId ?? null };
      const url = ndaId ? `/api/admin/ndas/${ndaId}` : '/api/admin/ndas';
      const method = ndaId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { nda?: { id: string }; error?: string };
      if (!res.ok || !json.nda) throw new Error(json.error || `Save failed (${res.status})`);
      setSavedAt(Date.now());
      if (!ndaId) {
        setNdaId(json.nda.id);
        router.push(`/admin/ndas/${json.nda.id}`);
      }
    } catch (err) {
      console.error('[nda] save failed', err);
      window.alert(err instanceof Error ? err.message : 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    const el = pageRef.current;
    if (!el || downloading) return;
    setDownloading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const cp = safeFilenameSegment(data.counterpartyCompanyName, 'Counterparty');
      const filename = `BossLabs-NDA-${cp}-${today}.pdf`;
      const html2pdfMod = await import('html2pdf.js');
      const html2pdf = (html2pdfMod.default ?? html2pdfMod) as (() => {
        set: (opts: Record<string, unknown>) => { from: (el: HTMLElement) => { save: () => Promise<void> } };
      });
      await html2pdf()
        .set({
          filename,
          margin: 0,
          image: { type: 'jpeg', quality: 0.96 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 794 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        })
        .from(el)
        .save();
    } catch (err) {
      console.error('[nda] PDF download failed', err);
      window.alert('Sorry, the PDF could not be generated. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  // Reused CSS lives in ContractMaker's style block via .contract-no-print /
  // .contract-page / .contract-page-frame / .contract-preview-section /
  // .contract-doc / .contract-letterhead. We mount the same class names so
  // the existing print rules apply without duplication. Local style block
  // below only re-asserts Arial across this component's UI.

  return (
    <div className="contract-maker-root space-y-6">
      {/* Tabs */}
      <div className="contract-no-print -mx-4 border-b border-slate-200 bg-white px-4 sm:-mx-6 sm:px-6">
        <nav className="flex gap-1 text-[13px]">
          <Link
            href="/admin/ndas"
            className="rounded-t-md border-b-2 border-transparent px-3 py-2.5 font-medium text-slate-500 transition hover:text-slate-900"
          >
            All NDAs
          </Link>
          <span className="rounded-t-md border-b-2 border-cyan-600 px-3 py-2.5 font-semibold text-cyan-700">
            {ndaId ? 'Editor' : 'New NDA'}
          </span>
        </nav>
      </div>

      {/* Action bar */}
      <div className="contract-no-print sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#F5F7FB]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900">NDA Maker</h1>
          <p className="text-[12px] text-slate-500">
            BossLabs Mutual Non-Disclosure Agreement — fill the form, preview live, print to PDF.
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
            onClick={() => setData(DEFAULT_NDA_FORM)}
            className="rounded-full border border-slate-300 px-4 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-white"
          >
            Reset form
          </button>
          <button
            type="button"
            onClick={saveNda}
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
                  <path d="M5 4h11l3 3v13H5V4z M9 4v6h6V4 M7 14h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {ndaId ? 'Save changes' : 'Save NDA'}
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

      {/* Linked customer */}
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
          Link this NDA to an existing customer so it shows on their profile.
        </p>
        <CustomerLinkPicker linked={linked} onPick={setLinked} />
      </section>

      {/* Mobile tab */}
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
            <h2 className="mb-3 text-base font-semibold text-slate-900">Counterparty</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>Company name *</label>
                <input
                  type="text"
                  value={data.counterpartyCompanyName}
                  onChange={(e) => setData({ ...data, counterpartyCompanyName: e.target.value })}
                  className={inputCls}
                  placeholder="MECHANICAL HANDLING EQUIPMENT CO., INC."
                />
              </div>
              <div>
                <label className={labelCls}>Signatory name *</label>
                <input
                  type="text"
                  value={data.counterpartyRepName}
                  onChange={(e) => setData({ ...data, counterpartyRepName: e.target.value })}
                  className={inputCls}
                  placeholder="Juan Dela Cruz"
                />
              </div>
              <div>
                <label className={labelCls}>Position *</label>
                <input
                  type="text"
                  value={data.counterpartyRepPosition}
                  onChange={(e) => setData({ ...data, counterpartyRepPosition: e.target.value })}
                  className={inputCls}
                  placeholder="President"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Principal office address</label>
                <input
                  type="text"
                  value={data.counterpartyOfficeAddress}
                  onChange={(e) => setData({ ...data, counterpartyOfficeAddress: e.target.value })}
                  className={inputCls}
                  placeholder="Suite 812 Herrera Tower, V.A. Rufino corner Valero Street, Salcedo Village, Makati City"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">BossLabs side</h2>
            <div className="grid gap-3">
              <div>
                <label className={labelCls}>BossLabs principal office address</label>
                <input
                  type="text"
                  value={data.bosslabsOfficeAddress}
                  onChange={(e) => setData({ ...data, bosslabsOfficeAddress: e.target.value })}
                  className={inputCls}
                  placeholder="3rd Flr. J&amp;M Ramos Bldg., Gen. Yengco St., Brgy. Poblacion IV-A, Imus, Cavite"
                />
              </div>
              <div>
                <label className={labelCls}>SEC Registration No.</label>
                <input
                  type="text"
                  value={data.bosslabsSecRegNo}
                  onChange={(e) => setData({ ...data, bosslabsSecRegNo: e.target.value })}
                  className={inputCls}
                  placeholder="2024XXXXXXXX"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Engagement recitals</h2>
            <div className="grid gap-3">
              <div>
                <label className={labelCls}>Counterparty business description</label>
                <textarea
                  value={data.counterpartyBusinessDescription}
                  onChange={(e) => setData({ ...data, counterpartyBusinessDescription: e.target.value })}
                  className={`${inputCls} min-h-[78px] resize-y`}
                  placeholder="a dynamic and innovative enterprise established in 1984, engaged in the supply and distribution of industrial equipment, system integration, and related engineering services, operating across the Philippines through its group of companies and affiliates"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Goes into the second &ldquo;WHEREAS&rdquo; line, after the counterparty name.
                </p>
              </div>
              <div>
                <label className={labelCls}>Purpose / engagement description</label>
                <textarea
                  value={data.purposeDescription}
                  onChange={(e) => setData({ ...data, purposeDescription: e.target.value })}
                  className={`${inputCls} min-h-[78px] resize-y`}
                  placeholder="the Parties wish to explore and undertake a potential or actual business engagement under which BossLabs shall design, develop, and deliver software applications and the supporting digital backbone and infrastructure for the Counterparty and its group of companies"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Goes into the third &ldquo;WHEREAS&rdquo; line and becomes the &ldquo;Purpose&rdquo; referenced throughout.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Effective date &amp; venue</h2>
            <div className="grid gap-3 sm:grid-cols-2">
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
                  placeholder="Makati City"
                />
              </div>
            </div>
          </section>
        </form>

        {/* PREVIEW */}
        <section className={`contract-preview-section ${mobileView === 'preview' ? '' : 'hidden lg:block'}`}>
          <div className="contract-no-print mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-500">
            <span className="truncate">Live preview · what the PDF will look like</span>
            <span>NDA</span>
          </div>
          <div className="contract-page-frame">
            <div ref={pageRef} className="contract-page">
              <NdaDocument data={data} />
            </div>
          </div>
        </section>
      </div>

      <style jsx global>{`
        .contract-maker-root,
        .contract-maker-root input,
        .contract-maker-root select,
        .contract-maker-root textarea,
        .contract-maker-root button {
          font-family: Arial, Helvetica, sans-serif !important;
        }
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
