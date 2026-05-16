'use client';

import { useState } from 'react';
import type { EmailTemplate } from '@/lib/db';

export function EmailTemplatesEditor({ initial }: { initial: EmailTemplate[] }) {
  const [templates, setTemplates] = useState(initial);
  const [activeId, setActiveId] = useState(initial[0]?.id || '');
  const active = templates.find((t) => t.id === activeId);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* Sidebar — list (becomes a select on mobile) */}
      <aside className="card lg:p-3">
        <h2 className="hidden text-xs uppercase tracking-[0.06em] text-slate-500 lg:block lg:px-2 lg:py-1.5">
          Templates
        </h2>
        <select
          className="input lg:hidden"
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
  const [html, setHtml] = useState(template.html);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function save() {
    setSaving('saving');
    setError(null);
    try {
      await onSave({ ...template, subject, html });
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
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="label">HTML body</label>
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              {preview ? 'Edit HTML' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <iframe
                title="Email preview"
                srcDoc={html}
                className="min-h-[420px] w-full bg-white"
              />
            </div>
          ) : (
            <textarea
              className="input"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
            />
          )}
        </div>
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
