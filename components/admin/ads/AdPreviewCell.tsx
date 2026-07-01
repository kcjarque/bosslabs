'use client';

import { useState } from 'react';
import { AD_PREVIEW_FORMATS, type AdPreviewFormat } from '@/lib/meta-ads-formats';

type PreviewResp = { src?: string; width?: number; height?: number; html?: string; error?: string };

/** Small clickable thumbnail (32×32) next to an ad name. Click opens a modal
 *  with the Meta-rendered ad preview iframe. Format switcher lets the admin
 *  eyeball how the same creative renders across Feed / Story / Reels. */
export function AdPreviewCell({ adId, thumbnailUrl, adName }: {
  adId: string;
  thumbnailUrl: string | null | undefined;
  adName: string;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<AdPreviewFormat>('DESKTOP_FEED_STANDARD');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResp | null>(null);

  async function loadPreview(nextFormat: AdPreviewFormat) {
    setLoading(true);
    setPreview(null);
    try {
      const res = await fetch(`/api/admin/ads/preview?id=${adId}&format=${nextFormat}`);
      const json = (await res.json().catch(() => ({}))) as PreviewResp;
      if (!res.ok) setPreview({ error: json.error || `HTTP ${res.status}` });
      else setPreview(json);
    } catch (err) {
      setPreview({ error: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setLoading(false);
    }
  }

  function onOpen() {
    setOpen(true);
    if (!preview) loadPreview(format);
  }

  function changeFormat(next: AdPreviewFormat) {
    setFormat(next);
    loadPreview(next);
  }

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Preview ad: ${adName}`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-100 transition hover:border-cyan-400 hover:shadow"
      >
        {thumbnailUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-400">
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="9" cy="11" r="1.5" fill="currentColor" />
            <path d="M4 17l5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4 py-6"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            {/* Header */}
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-[14px] font-semibold text-slate-900">{adName}</h2>
                <p className="text-[11px] text-slate-500">Ad ID {adId}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            {/* Format picker + open-standalone */}
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 px-5 py-2.5">
              {AD_PREVIEW_FORMATS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => changeFormat(f.key)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    format === f.key
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              {preview?.src && (
                <a
                  href={preview.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-cyan-700"
                >
                  Open ↗
                </a>
              )}
            </div>

            {/* Preview — inject Meta's own iframe HTML so sandbox/referer
                policies stay identical to how their docs render it. */}
            <div className="flex min-h-[300px] flex-1 items-start justify-center overflow-auto bg-slate-100 p-4">
              {loading && <p className="text-[13px] text-slate-500">Loading preview…</p>}
              {!loading && preview?.error && (
                <div className="max-w-md text-center">
                  <p className="text-[13px] font-medium text-rose-700">Preview unavailable</p>
                  <p className="mt-1 text-[12px] text-slate-500">{preview.error}</p>
                </div>
              )}
              {!loading && preview?.html && (
                <div
                  className="ad-preview-frame"
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
