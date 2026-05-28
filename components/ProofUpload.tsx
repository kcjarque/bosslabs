'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function ProofUpload({ id }: { id: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | null) {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('Please choose an image (a screenshot of your payment).');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('That image is over 10MB — please pick a smaller screenshot.');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function submit() {
    if (!file) {
      setError('Please attach your payment screenshot first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('id', id);
      fd.append('file', file);
      const res = await fetch('/api/retreat/proof', { method: 'POST', body: fd });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || 'Upload failed.');
      router.push(`/vibecode-retreat/reserve/${id}/done`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center transition hover:border-cyan-400 hover:bg-cyan-50/40"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Payment proof preview"
            className="max-h-56 rounded-lg object-contain"
          />
        ) : (
          <>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" className="text-cyan-500">
              <path
                d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-sm font-medium text-slate-700">
              Tap to upload your payment screenshot
            </span>
            <span className="text-xs text-slate-400">PNG or JPG, up to 10MB</span>
          </>
        )}
      </button>

      {preview && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 text-xs font-medium text-cyan-700 hover:underline"
        >
          Choose a different image
        </button>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || !file}
        className="mt-5 w-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-6 py-3.5 font-sans text-base font-medium text-white shadow-[0_14px_34px_-12px_rgba(0,150,200,0.65)] transition hover:from-cyan-400 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Sending…' : 'Submit payment proof →'}
      </button>
    </div>
  );
}
