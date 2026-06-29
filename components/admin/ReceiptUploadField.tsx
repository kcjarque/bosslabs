'use client';

/**
 * ReceiptUploadField — used inside the admin expenses form. Lets you pick an
 * image or PDF receipt, uploads it to /api/admin/upload-receipt, and writes
 * the resulting public URL into a hidden input named `receiptUrl` so it
 * submits with the surrounding `<form action={addExpenseAction}>`.
 *
 * Self-contained: no parent state needed. Optional — the surrounding form
 * works fine when the field is empty.
 */
import { useRef, useState } from 'react';

export function ReceiptUploadField() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('uploading');
    setError('');
    setFileName(file.name);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/admin/upload-receipt', { method: 'POST', body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error || `Upload failed (${res.status})`);
      }
      setUrl(json.url);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setStatus('error');
      setUrl('');
      setFileName('');
    }
  }

  function clear() {
    setUrl('');
    setFileName('');
    setStatus('idle');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  const isImage = url && /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url);

  return (
    <div>
      <label className="label">Receipt / screenshot (optional)</label>
      {/* Hidden field that submits with the form. */}
      <input type="hidden" name="receiptUrl" value={url} />
      {!url && (
        <label
          htmlFor="receipt-file"
          className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-600 transition hover:border-cyan-400 hover:bg-cyan-50/50"
        >
          <span className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-slate-400">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {status === 'uploading' ? (
              <span className="text-cyan-700">Uploading {fileName}…</span>
            ) : (
              <span>Attach image or PDF</span>
            )}
          </span>
          <span className="text-[11px] text-slate-400">Max 12 MB</span>
        </label>
      )}
      <input
        ref={inputRef}
        id="receipt-file"
        type="file"
        accept="image/*,application/pdf"
        onChange={onPick}
        className="hidden"
      />
      {url && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50/60 px-3 py-2.5 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="h-9 w-9 flex-none rounded border border-emerald-200 object-cover" />
            ) : (
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded border border-emerald-200 bg-white text-[10px] font-semibold text-emerald-700">
                PDF
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-emerald-800" title={fileName || url}>
              {fileName || 'Receipt attached'}
            </span>
          </div>
          <button
            type="button"
            onClick={clear}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
          >
            Replace
          </button>
        </div>
      )}
      {status === 'error' && (
        <p className="mt-1 text-[12px] text-rose-600">{error}</p>
      )}
    </div>
  );
}
