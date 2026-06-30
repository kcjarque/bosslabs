'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const peso = (c: number) =>
  `₱${(c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Per-closer Payout button + confirmation modal.
 *
 *  Flow: click "Pay out ₱X" → modal asks for deposit slip upload + optional
 *  note → confirm. On confirm:
 *    1. Upload slip via /api/admin/upload-receipt (reuses the existing
 *       admin-only image+PDF endpoint, no new bucket needed)
 *    2. POST /api/admin/closer-payouts with the resulting URL
 *    3. router.refresh() so the closer's pending commissions disappear
 *       from this tab and reappear under Payout History */
export function PayoutButton({
  closerId,
  closerName,
  totalCentavos,
  commissionCount,
}: {
  closerId: string;
  closerName: string;
  totalCentavos: number;
  commissionCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const [slipName, setSlipName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setSlipUrl(null);
    setSlipName(null);
    setNote('');
  }

  async function uploadSlip(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/upload-receipt', { method: 'POST', body: fd });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || `HTTP ${res.status}`);
      setSlipUrl(json.url);
      setSlipName(file.name);
    } catch (err) {
      console.error('[payout] slip upload failed', err);
      window.alert(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function confirm() {
    if (busy) return;
    if (!slipUrl) {
      window.alert('Upload the deposit slip first.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/closer-payouts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          closerId,
          slipUrl,
          slipFilename: slipName,
          note: note.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; payout?: { id: string } };
      if (!res.ok || !json.payout) throw new Error(json.error || `HTTP ${res.status}`);
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      console.error('[payout] confirm failed', err);
      window.alert(err instanceof Error ? err.message : 'Payout failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-emerald-700"
      >
        Pay out {peso(totalCentavos)}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2 className="text-base font-semibold text-slate-900">Confirm payout</h2>
            <p className="mt-1 text-[13px] text-slate-600">
              Pay <strong>{closerName}</strong> <strong className="text-emerald-700">{peso(totalCentavos)}</strong>{' '}
              covering <strong>{commissionCount}</strong> pending commission{commissionCount === 1 ? '' : 's'}.
            </p>

            {/* Slip upload */}
            <div className="mt-4">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                Deposit slip *
              </label>
              {slipUrl ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px]">
                  <span className="truncate text-emerald-800">
                    ✓ {slipName ?? 'Uploaded'}
                  </span>
                  <button
                    type="button"
                    onClick={reset}
                    className="text-[11px] font-medium text-rose-700 hover:underline"
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-[13px] text-slate-600 transition hover:border-cyan-400 hover:bg-cyan-50 disabled:opacity-60"
                  >
                    {uploading ? 'Uploading…' : 'Choose image or PDF'}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadSlip(f);
                      e.target.value = '';
                    }}
                  />
                </>
              )}
            </div>

            {/* Optional note */}
            <div className="mt-3">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                Note (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200 min-h-[60px] resize-y"
                placeholder="e.g. GCash transfer ref XYZ"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-full border border-slate-300 px-4 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={busy || !slipUrl}
                className="rounded-full bg-emerald-600 px-5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-50"
              >
                {busy ? 'Recording…' : `Pay ${peso(totalCentavos)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
