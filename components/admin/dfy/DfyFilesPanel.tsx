'use client';

import { useRef, useState } from 'react';
import type { DfyFile } from '@/lib/dfy';

const KIND_LABEL: Record<DfyFile['kind'], string> = {
  contract: 'Contract',
  vision: 'Vision',
  design: 'Design',
  other: 'Other',
};

const KIND_COLOR: Record<DfyFile['kind'], string> = {
  contract: 'bg-cyan-100 text-cyan-700',
  vision: 'bg-violet-100 text-violet-700',
  design: 'bg-amber-100 text-amber-700',
  other: 'bg-slate-200 text-slate-600',
};

function humanSize(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function DfyFilesPanel({ projectId, initial }: { projectId: string; initial: DfyFile[] }) {
  const [files, setFiles] = useState<DfyFile[]>(initial);
  const [uploading, setUploading] = useState(false);
  const [draggingOver, setDraggingOver] = useState(false);
  const [kind, setKind] = useState<DfyFile['kind']>('contract');
  const inputRef = useRef<HTMLInputElement>(null);

  // External URL form state
  const [extUrl, setExtUrl] = useState('');
  const [extName, setExtName] = useState('');

  async function uploadFiles(list: FileList | File[]) {
    if (!list || (list as FileList).length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(list as FileList)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('kind', kind);
        const res = await fetch(`/api/admin/dfy-projects/${projectId}/files`, {
          method: 'POST',
          body: fd,
        });
        const json = (await res.json().catch(() => ({}))) as { file?: DfyFile; error?: string };
        if (!res.ok || !json.file) throw new Error(json.error || `HTTP ${res.status}`);
        setFiles((cur) => [json.file as DfyFile, ...cur]);
      }
    } catch (err) {
      console.error('[dfy/files] upload failed', err);
      window.alert(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function addExternal() {
    if (!extUrl.trim() || !extName.trim()) {
      window.alert('Both URL and a display name are required.');
      return;
    }
    setUploading(true);
    try {
      const res = await fetch(`/api/admin/dfy-projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ externalUrl: extUrl.trim(), name: extName.trim(), kind }),
      });
      const json = (await res.json().catch(() => ({}))) as { file?: DfyFile; error?: string };
      if (!res.ok || !json.file) throw new Error(json.error || `HTTP ${res.status}`);
      setFiles((cur) => [json.file as DfyFile, ...cur]);
      setExtUrl('');
      setExtName('');
    } catch (err) {
      console.error('[dfy/files] add external failed', err);
      window.alert(err instanceof Error ? err.message : 'Add failed.');
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(fileId: string) {
    if (!window.confirm('Remove this file?')) return;
    try {
      const res = await fetch(`/api/admin/dfy-projects/${projectId}/files/${fileId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFiles((cur) => cur.filter((f) => f.id !== fileId));
    } catch (err) {
      console.error('[dfy/files] delete failed', err);
      window.alert('Delete failed.');
    }
  }

  return (
    <div className="space-y-5">
      {/* Upload + kind picker */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Add file</h2>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tag as</span>
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-[12px]">
            {(['contract', 'vision', 'design', 'other'] as DfyFile['kind'][]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-md px-2.5 py-1 transition ${
                  kind === k ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        {/* Drag-drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDraggingOver(true);
          }}
          onDragLeave={() => setDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDraggingOver(false);
            const dropped = e.dataTransfer.files;
            if (dropped && dropped.length > 0) uploadFiles(dropped);
          }}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${
            draggingOver ? 'border-cyan-500 bg-cyan-50' : 'border-slate-300 bg-slate-50/60'
          }`}
        >
          <p className="text-[13px] text-slate-600">
            {uploading ? 'Uploading…' : 'Drag a file here, or click to choose'}
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="mt-2 rounded-full bg-cyan-600 px-4 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-wait disabled:opacity-70"
          >
            Choose files
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) uploadFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <p className="mt-2 text-[10.5px] text-slate-400">Up to 25 MB per file. Stored in Supabase.</p>
        </div>

        {/* External URL */}
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr,1fr,auto]">
          <input
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200"
            placeholder="https://… (Notion, Drive, Figma)"
            value={extUrl}
            onChange={(e) => setExtUrl(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200"
            placeholder="Display name"
            value={extName}
            onChange={(e) => setExtName(e.target.value)}
          />
          <button
            type="button"
            onClick={addExternal}
            disabled={uploading}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Link instead
          </button>
        </div>
      </section>

      {/* File list */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          Files{' '}
          <span className="text-[12px] font-normal text-slate-400">({files.length})</span>
        </h2>
        {files.length === 0 ? (
          <p className="text-[13px] text-slate-500">No files yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_COLOR[f.kind]}`}
                    >
                      {KIND_LABEL[f.kind]}
                    </span>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-[13px] font-medium text-slate-900 hover:text-cyan-700 hover:underline"
                    >
                      {f.name}
                    </a>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {humanSize(f.sizeBytes)} · {f.uploadedAt?.slice(0, 10)}
                    {f.uploadedBy ? ` · ${f.uploadedBy}` : ''}
                    {f.externalUrl ? ' · external link' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  aria-label="Remove file"
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
