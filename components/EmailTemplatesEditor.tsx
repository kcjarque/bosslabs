'use client';

/**
 * EmailTemplatesEditor — text-form editor + live preview.
 *
 * The admin types a small markdown subset (see lib/email-markdown.ts) in
 * the left textarea; the right pane is an iframe that re-renders the
 * BOSSLABS-shelled HTML every keystroke (debounced via a server hop).
 *
 * Legacy templates that were authored as raw HTML (body = null) start in
 * "HTML mode" with a banner offering a one-click conversion to markdown.
 * Once converted, the editor stays in text mode forever and html becomes
 * a generated artifact regenerated on every save.
 */

import { useCallback, useEffect, useState } from 'react';
import type { EmailTemplate } from '@/lib/db';

function slugifyId(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export function EmailTemplatesEditor({ initial }: { initial: EmailTemplate[] }) {
  const [templates, setTemplates] = useState(initial);
  const [activeId, setActiveId] = useState(initial[0]?.id || '');
  const active = templates.find((t) => t.id === activeId);

  // "New template" creation state.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newId, setNewId] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function createTemplate() {
    const name = newName.trim();
    const id = (newId.trim() || slugifyId(name)).toLowerCase();
    if (!name) {
      setCreateError('Give your template a name.');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(id)) {
      setCreateError('ID can only use lowercase letters, numbers, and underscores.');
      return;
    }
    if (templates.some((t) => t.id === id)) {
      setCreateError('A template with that ID already exists.');
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    const starter = `^^BOSSLABS AI^^\n# Hello {{firstName}}\n\nWrite your email here — use the formatting cheatsheet below.`;
    try {
      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'email',
          template: { id, name, subject: name, body: starter },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not create the template.');
      }
      const created: EmailTemplate = { id, name, subject: name, html: '', body: starter };
      setTemplates((list) => [...list, created]);
      setActiveId(id);
      setCreating(false);
      setNewName('');
      setNewId('');
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not create the template.');
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="card lg:p-3">
        <div className="flex items-center justify-between gap-2 lg:px-2 lg:py-1.5">
          <h2 className="text-xs uppercase tracking-[0.06em] text-slate-500">
            Templates
          </h2>
          <button
            type="button"
            onClick={() => {
              setCreating((v) => !v);
              setCreateError(null);
            }}
            className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-slate-700"
          >
            {creating ? 'Close' : '+ New'}
          </button>
        </div>

        {creating && (
          <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <input
              className="input"
              placeholder="Template name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <input
              className="input font-mono text-[12px]"
              placeholder={newName ? slugifyId(newName) : 'template_id (auto)'}
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
            />
            <p className="text-[10px] leading-snug text-slate-500">
              ID is how the app refers to it. Leave blank to auto-generate from
              the name.
            </p>
            {createError && (
              <p className="text-[11px] text-red-600">{createError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={createTemplate}
                disabled={createBusy}
                className="btn btn-primary flex-1 !py-1.5 text-[12px]"
              >
                {createBusy ? 'Creating…' : 'Create template'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setCreateError(null);
                }}
                className="btn btn-secondary !py-1.5 text-[12px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <select
          className="input mt-2 lg:hidden"
          value={activeId}
          onChange={(e) => setActiveId(e.target.value)}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <ul className="hidden lg:mt-1 lg:block">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setActiveId(t.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                  activeId === t.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="font-medium">{t.name}</div>
                <div
                  className={`mt-0.5 text-[11px] ${
                    activeId === t.id ? 'text-white/60' : 'text-slate-500'
                  }`}
                >
                  {t.id}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div>
        {active ? (
          <Editor
            key={active.id}
            template={active}
            onSave={async (next) => {
              const res = await fetch('/api/admin/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: 'email', template: next }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Save failed');
              }
              setTemplates((list) =>
                list.map((t) => (t.id === next.id ? next : t)),
              );
            }}
          />
        ) : (
          <div className="card text-sm text-slate-500">No templates yet.</div>
        )}
      </div>
    </div>
  );
}

function Editor({
  template,
  onSave,
}: {
  template: EmailTemplate;
  onSave: (t: EmailTemplate) => Promise<void>;
}) {
  const [subject, setSubject] = useState(template.subject);
  // `body` is the markdown source — primary edit surface. When null on
  // load, the template was authored before the text editor existed and
  // we offer the admin a "Convert to text editor" button instead.
  const [body, setBody] = useState<string | null>(template.body ?? null);
  // `html` is what gets sent. In text mode it's regenerated server-side
  // on save from `body`; in legacy HTML mode it's the source of truth.
  const [html, setHtml] = useState(template.html);
  const [previewHtml, setPreviewHtml] = useState(template.html);
  const [showLegacyHtml, setShowLegacyHtml] = useState(false);

  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Re-render the preview pane whenever the markdown body changes. Hits
  // the server preview endpoint so the rendering logic stays single-
  // sourced (no duplicate markdown→HTML in the browser). Debounced 200ms
  // so a fast typist doesn't fire one request per keystroke.
  const refreshPreview = useCallback(async (md: string) => {
    try {
      const res = await fetch('/api/admin/templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: md }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { html?: string };
      if (data.html) setPreviewHtml(data.html);
    } catch {
      // Preview pane goes stale — non-fatal. The next keystroke retries.
    }
  }, []);

  useEffect(() => {
    if (body == null) return;
    const t = setTimeout(() => void refreshPreview(body), 200);
    return () => clearTimeout(t);
  }, [body, refreshPreview]);

  async function convertHtmlToText() {
    try {
      const res = await fetch('/api/admin/templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromHtml: template.html }),
      });
      if (!res.ok) throw new Error('Convert failed');
      const data = (await res.json()) as { markdown?: string; html?: string };
      setBody(data.markdown ?? '');
      if (data.html) setPreviewHtml(data.html);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not convert');
    }
  }

  async function save() {
    setSaving('saving');
    setError(null);
    try {
      // In text mode we ship the markdown body and let the server
      // regenerate html. In legacy mode we ship html only.
      const next: EmailTemplate =
        body == null
          ? { ...template, subject, html, body: null }
          : { ...template, subject, html: previewHtml, body };
      await onSave(next);
      setHtml(next.html);
      setSaving('saved');
      setTimeout(() => setSaving('idle'), 1500);
    } catch (err: unknown) {
      setSaving('error');
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function sendTest() {
    if (!testTo) return;
    setTestStatus('sending');
    try {
      const res = await fetch('/api/admin/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'email',
          templateId: template.id,
          to: testTo,
          firstName: 'Friend',
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Send failed');
      }
      setTestStatus('sent');
      setTimeout(() => setTestStatus('idle'), 1800);
    } catch {
      setTestStatus('error');
    }
  }

  const inTextMode = body != null;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.06em] text-slate-500">
              Template ID
            </div>
            <code className="text-sm font-medium text-slate-900">{template.id}</code>
          </div>
          <span className="pill pill-cyan">{template.name}</span>
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="subject">
            Subject line
          </label>
          <input
            id="subject"
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* Legacy notice — old templates open in HTML mode until the admin
            chooses to convert. The conversion is one-way; once you've
            edited as markdown, the html column is regenerated on save. */}
        {!inTextMode && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="font-medium">This template is in legacy HTML mode.</div>
            <p className="mt-1 text-[13px] text-amber-900/80">
              Switch to the text editor for a friendlier write + live preview.
              Conversion is best-effort — review the result before saving.
            </p>
            <button
              type="button"
              onClick={convertHtmlToText}
              className="mt-3 rounded-full bg-amber-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-amber-800"
            >
              Convert to text editor →
            </button>
          </div>
        )}

        {/* Editor body — text mode shows split textarea + preview iframe.
            Legacy HTML mode shows the raw HTML textarea + preview. */}
        {inTextMode ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <label className="label">Message (text)</label>
              <p className="mt-1 text-[11px] text-slate-500">
                Type plain text. We&rsquo;ll style + add the BOSSLABS logo around it.
              </p>
              <textarea
                className="input mt-2 font-mono text-[13px]"
                style={{ minHeight: 360 }}
                value={body ?? ''}
                onChange={(e) => setBody(e.target.value)}
              />
              <details className="mt-2 text-[11px] text-slate-500">
                <summary className="cursor-pointer">Formatting cheatsheet</summary>
                <div className="mt-2 space-y-1 rounded-md bg-slate-50 p-3 leading-relaxed">
                  <div><code>{'^^EYEBROW^^'}</code> — small cyan uppercase label</div>
                  <div><code>{'# Headline'}</code> — big serif headline</div>
                  <div><code>{'## Subhead'}</code> — small uppercase subhead</div>
                  <div><code>**bold**</code> · <code>*italic*</code></div>
                  <div><code>[label](https://…)</code> — inline link</div>
                  <div><code>[[Button label]](https://…)</code> — pill CTA button</div>
                  <div><code>---</code> — horizontal divider</div>
                  <div>Blank line = new paragraph. <code>{'{{firstName}}'}</code> variables pass through.</div>
                </div>
              </details>
            </div>
            <div>
              <label className="label">Live preview</label>
              <p className="mt-1 text-[11px] text-slate-500">
                Updates as you type. Variables show as <code>{'{{firstName}}'}</code>{' '}
                — replaced at send time.
              </p>
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-[#F5F7FB]">
                <iframe
                  title="Email preview"
                  srcDoc={previewHtml}
                  className="w-full bg-white"
                  style={{ minHeight: 420 }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <label className="label">HTML body (legacy mode)</label>
              <textarea
                className="input mt-2 font-mono text-[12px]"
                style={{ minHeight: 360 }}
                value={html}
                onChange={(e) => {
                  setHtml(e.target.value);
                  setPreviewHtml(e.target.value);
                }}
              />
              <button
                type="button"
                onClick={() => setShowLegacyHtml((p) => !p)}
                className="mt-2 text-[11px] text-slate-500 hover:text-slate-900"
              >
                {showLegacyHtml ? 'Hide preview' : 'Show preview'}
              </button>
            </div>
            <div>
              <label className="label">Preview</label>
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <iframe
                  title="Email preview"
                  srcDoc={previewHtml}
                  className="w-full"
                  style={{ minHeight: 420 }}
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Variables: <Code>{'{{firstName}}'}</Code> <Code>{'{{email}}'}</Code>{' '}
            <Code>{'{{webinarDate}}'}</Code> <Code>{'{{webinarTime}}'}</Code>{' '}
            <Code>{'{{zoomJoinUrl}}'}</Code> <Code>{'{{replayUrl}}'}</Code>{' '}
            <Code>{'{{messengerGroupUrl}}'}</Code>
          </p>
          <button
            type="button"
            onClick={save}
            disabled={saving === 'saving'}
            className="btn btn-primary self-start sm:self-auto"
          >
            {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved ✓' : 'Save template'}
          </button>
        </div>
      </div>

      {/* Test send */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-900">Send a test email</h3>
        <p className="mt-1 text-xs text-slate-500">
          Uses your live Resend key if configured. Falls back to a console log in demo mode.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@example.com"
            className="input sm:flex-1"
          />
          <button
            type="button"
            onClick={sendTest}
            disabled={!testTo || testStatus === 'sending'}
            className="btn btn-secondary"
          >
            {testStatus === 'sending'
              ? 'Sending…'
              : testStatus === 'sent'
                ? 'Sent ✓'
                : testStatus === 'error'
                  ? 'Error — retry'
                  : 'Send test'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-[11px]">{children}</code>
  );
}
