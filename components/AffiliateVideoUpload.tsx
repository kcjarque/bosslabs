'use client';

import { useState } from 'react';

type VideoItem = {
  id: string;
  originalName: string;
  sizeBytes: number;
  url: string | null;
  createdAt: string;
};

function fmtSize(bytes: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Affiliate testimonial uploader. Files go straight to Supabase Storage via a
 * server-signed URL (so big videos don't hit the serverless body limit), then
 * we record the row. Light theme to match the affiliate dashboard.
 */
export function AffiliateVideoUpload({
  token,
  initialVideos,
}: {
  token: string;
  initialVideos: VideoItem[];
}) {
  const [videos, setVideos] = useState<VideoItem[]>(initialVideos);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const signRes = await fetch('/api/affiliate/video/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, filename: file.name, contentType: file.type }),
      });
      const sign = await signRes.json();
      if (!signRes.ok) throw new Error(sign.error || 'Could not start the upload');

      const put = await fetch(sign.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
        body: file,
      });
      if (!put.ok) {
        throw new Error(
          put.status === 413
            ? 'That file is too large. Try a shorter clip or compress it.'
            : `Upload failed (${put.status}). Please try again.`,
        );
      }

      const confirmRes = await fetch('/api/affiliate/video/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          path: sign.path,
          originalName: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      if (!confirmRes.ok) {
        const c = await confirmRes.json().catch(() => ({}));
        throw new Error(c.error || 'Saved the file but failed to record it — refresh and check.');
      }

      // Instant preview from the local file (no extra round-trip).
      setVideos((v) => [
        {
          id: `new-${Date.now()}`,
          originalName: file.name,
          sizeBytes: file.size,
          url: URL.createObjectURL(file),
          createdAt: new Date().toISOString(),
        },
        ...v,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-cyan-300 bg-cyan-50/50 px-5 py-6 text-center text-sm font-medium text-cyan-800 transition hover:bg-cyan-50 ${
          uploading ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        <input
          type="file"
          accept="video/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        {uploading ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-300 border-t-cyan-700" />
            Uploading your video…
          </span>
        ) : (
          <span>📹 Tap to upload your testimonial video</span>
        )}
      </label>
      <p className="mt-2 text-[12px] text-slate-500">
        Short and real wins. We&rsquo;ll run ads to it — every sale it drives pays you.
      </p>
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {videos.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {videos.map((v) => (
            <div key={v.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {v.url ? (
                <video src={v.url} controls className="aspect-video w-full bg-black object-contain" />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-slate-100 text-xs text-slate-400">
                  Processing…
                </div>
              )}
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate text-[12px] text-slate-600" title={v.originalName}>
                  {v.originalName}
                </span>
                <span className="flex-none text-[11px] text-slate-400">{fmtSize(v.sizeBytes)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
