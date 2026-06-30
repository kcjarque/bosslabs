'use client';

import { useEffect, useState } from 'react';
import type { DfyComment, DfyProject } from '@/lib/dfy';

/** DevOps tab: project links (top), build checklist (middle), comments (bottom).
 *  Build steps are stored on the project as JSONB; toggling one PATCHes the
 *  project with { toggleStep: slug, checked: boolean }. Comments are their
 *  own table and stream in via /comments. */
export function DfyDevOpsPanel({
  project: initialProject,
  initialComments,
}: {
  project: DfyProject;
  initialComments: DfyComment[];
}) {
  const [project, setProject] = useState<DfyProject>(initialProject);
  const [comments, setComments] = useState<DfyComment[]>(initialComments);
  const [savingLinks, setSavingLinks] = useState(false);
  const [linksSavedAt, setLinksSavedAt] = useState<number | null>(null);
  const [gitUrl, setGitUrl] = useState(project.gitUrl);
  const [stagingUrl, setStagingUrl] = useState(project.stagingUrl);
  const [prodUrl, setProdUrl] = useState(project.prodUrl);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  // Debounced autosave for links
  useEffect(() => {
    const t = setTimeout(async () => {
      const dirty =
        gitUrl !== project.gitUrl ||
        stagingUrl !== project.stagingUrl ||
        prodUrl !== project.prodUrl;
      if (!dirty) return;
      setSavingLinks(true);
      try {
        const res = await fetch(`/api/admin/dfy-projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ gitUrl, stagingUrl, prodUrl }),
        });
        const json = (await res.json().catch(() => ({}))) as { project?: DfyProject };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (json.project) setProject(json.project);
        setLinksSavedAt(Date.now());
      } catch (err) {
        console.error('[dfy/devops] save links failed', err);
        window.alert('Could not save links.');
      } finally {
        setSavingLinks(false);
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitUrl, stagingUrl, prodUrl]);

  async function toggleStep(slug: string, currentlyChecked: boolean) {
    const newChecked = !currentlyChecked;
    try {
      const res = await fetch(`/api/admin/dfy-projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toggleStep: slug, checked: newChecked }),
      });
      const json = (await res.json().catch(() => ({}))) as { project?: DfyProject };
      if (!res.ok || !json.project) throw new Error(`HTTP ${res.status}`);
      setProject(json.project);
    } catch (err) {
      console.error('[dfy/devops] toggle step failed', err);
      window.alert('Could not update checklist.');
    }
  }

  async function postComment() {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/admin/dfy-projects/${project.id}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { comment?: DfyComment; error?: string };
      if (!res.ok || !json.comment) throw new Error(json.error || `HTTP ${res.status}`);
      setComments((cur) => [...cur, json.comment as DfyComment]);
      setDraft('');
    } catch (err) {
      console.error('[dfy/devops] comment failed', err);
      window.alert(err instanceof Error ? err.message : 'Comment failed.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Links */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">Project links</h2>
          {savingLinks ? (
            <span className="text-[11px] text-slate-400">Saving…</span>
          ) : linksSavedAt ? (
            <span className="text-[11px] text-emerald-600">Saved</span>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <LinkField label="Git repo" value={gitUrl} onChange={setGitUrl} placeholder="https://github.com/…" />
          <LinkField label="Staging URL" value={stagingUrl} onChange={setStagingUrl} placeholder="https://…vercel.app" />
          <LinkField label="Production URL" value={prodUrl} onChange={setProdUrl} placeholder="https://…" />
        </div>
      </section>

      {/* Build checklist */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Build checklist</h2>
        <p className="mb-3 text-[12px] text-slate-500">
          Six gates, one per lane. Ticking a gate stamps it with your name and the time.
        </p>
        <ul className="divide-y divide-slate-200">
          {project.buildSteps.map((s) => {
            const checked = !!s.checkedAt;
            return (
              <li key={s.slug} className="flex items-center gap-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleStep(s.slug, checked)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
                    checked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white hover:border-cyan-400'
                  }`}
                  aria-label={`Toggle ${s.label}`}
                >
                  {checked && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12l5 5L20 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-[13px] ${checked ? 'font-medium text-slate-500 line-through' : 'font-semibold text-slate-900'}`}>
                    {s.label}
                  </div>
                  {checked && (
                    <div className="mt-0.5 text-[11px] text-emerald-700">
                      ✓ {s.checkedBy || 'someone'} · {s.checkedAt ? new Date(s.checkedAt).toLocaleString('en-PH') : ''}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Comments */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          Comments <span className="text-[12px] font-normal text-slate-400">({comments.length})</span>
        </h2>
        {comments.length === 0 ? (
          <p className="mb-4 text-[13px] text-slate-500">No comments yet. Drop a build note below.</p>
        ) : (
          <ul className="mb-4 space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold text-slate-700">{c.author}</span>
                  <span className="text-[10.5px] text-slate-400">
                    {new Date(c.createdAt).toLocaleString('en-PH')}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-slate-900">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Cmd/Ctrl+Enter to post — Trilor chat habit
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') postComment();
            }}
            placeholder="Add a build note… (⌘/Ctrl + Enter to post)"
            className="min-h-[64px] flex-1 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200"
          />
          <button
            type="button"
            onClick={postComment}
            disabled={posting || !draft.trim()}
            className="self-end rounded-full bg-cyan-600 px-5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-wait disabled:opacity-50"
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </section>
    </div>
  );
}

function LinkField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-900 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200"
        />
        {value && (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-cyan-700"
            aria-label={`Open ${label}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}
