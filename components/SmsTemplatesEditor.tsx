'use client';

import { useState } from 'react';
import type { SmsTemplate } from '@/lib/db';
import { smsPartCount } from '@/lib/sms-counter';

function slugifyId(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export function SmsTemplatesEditor({ initial }: { initial: SmsTemplate[] }) {
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
    const starter = `Hi {{firstName}}! `;
    try {
      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'sms', template: { id, name, body: starter } }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not create the template.');
      }
      const created: SmsTemplate = { id, name, body: starter };
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

      {active ? (
        <Editor
          key={active.id}
          template={active}
          onSave={async (next) => {
            const res = await fetch('/api/admin/templates', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: 'sms', template: next }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || 'Save failed');
            }
            setTemplates((list) => list.map((t) => (t.id === next.id ? next : t)));
          }}
        />
      ) : (
        <div className="card text-sm text-slate-500">No templates yet.</div>
      )}
    </div>
  );
}

function Editor({
  template,
  onSave,
}: {
  template: SmsTemplate;
  onSave: (t: SmsTemplate) => Promise<void>;
}) {
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const counts = smsPartCount(body);

  async function save() {
    setSaving('saving');
    setError(null);
    try {
      await onSave({ ...template, body });
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
          channel: 'sms',
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
          <div className="mb-2 flex items-center justify-between">
            <label className="label">Message body</label>
            <div className="text-xs text-slate-500">
              <span className="text-slate-900">{counts.length}</span> chars ·{' '}
              <span
                className={
                  counts.parts === 1 ? 'text-emerald-600' : 'text-amber-600'
                }
              >
                {counts.parts} SMS part{counts.parts > 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <textarea
            className="input"
            style={{ minHeight: '180px' }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
          />
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${
                counts.parts === 1
                  ? 'bg-emerald-500'
                  : counts.parts <= 2
                    ? 'bg-amber-500'
                    : 'bg-red-500'
              }`}
              style={{
                width: `${Math.min(100, (counts.length / (counts.perPart * Math.max(counts.parts, 1))) * 100)}%`,
              }}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Variables: <Code>{'{{firstName}}'}</Code> <Code>{'{{webinarDate}}'}</Code>{' '}
            <Code>{'{{webinarTime}}'}</Code> <Code>{'{{zoomJoinUrl}}'}</Code>{' '}
            <Code>{'{{messengerGroupUrl}}'}</Code> <Code>{'{{replayUrl}}'}</Code>
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

      <div className="card">
        <h3 className="text-sm font-semibold text-slate-900">Send a test SMS</h3>
        <p className="mt-1 text-xs text-slate-500">
          Goes through OneWaySMS when credentials are set. Demo mode otherwise.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="tel"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="+63 917 000 0000"
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
