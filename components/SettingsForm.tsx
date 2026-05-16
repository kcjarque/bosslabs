'use client';

import { useState } from 'react';
import type { Settings } from '@/lib/db';

export function SettingsForm({ initial }: { initial: Settings }) {
  const [values, setValues] = useState<Settings>(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function save() {
    setStatus('saving');
    setError(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1800);
    } catch (err: unknown) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-5"
    >
      <Section
        title="Email · Resend"
        description="Free tier: 3,000 emails / month, 100 / day. Create a key at resend.com/api-keys."
      >
        <Field label="API Key" hint="re_…">
          <input
            type="password"
            className="input"
            value={values.resendApiKey}
            onChange={(e) => update('resendApiKey', e.target.value)}
            placeholder="re_xxx"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From email">
            <input
              type="email"
              className="input"
              value={values.resendFromEmail}
              onChange={(e) => update('resendFromEmail', e.target.value)}
              placeholder="hello@bosslabs.ai"
            />
          </Field>
          <Field label="From name">
            <input
              type="text"
              className="input"
              value={values.resendFromName}
              onChange={(e) => update('resendFromName', e.target.value)}
              placeholder="BOSSLABS AI"
            />
          </Field>
        </div>
      </Section>

      <Section
        title="SMS · OneWaySMS"
        description="Filipino-friendly SMS gateway. Defaults to the HTTPS API endpoint."
      >
        <Field label="API endpoint">
          <input
            type="text"
            className="input"
            value={values.onewaysmsEndpoint}
            onChange={(e) => update('onewaysmsEndpoint', e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="API username">
            <input
              type="text"
              className="input"
              value={values.onewaysmsUsername}
              onChange={(e) => update('onewaysmsUsername', e.target.value)}
            />
          </Field>
          <Field label="API password">
            <input
              type="password"
              className="input"
              value={values.onewaysmsPassword}
              onChange={(e) => update('onewaysmsPassword', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Sender ID" hint="11 characters max">
          <input
            type="text"
            className="input"
            value={values.onewaysmsSenderId}
            onChange={(e) => update('onewaysmsSenderId', e.target.value)}
            maxLength={11}
          />
        </Field>
      </Section>

      <Section
        title="Webinar deliverables"
        description="These get injected into every email + SMS template as variables."
      >
        <Field label="Zoom registration URL" hint="Used in {{zoomRegisterUrl}}">
          <input
            type="url"
            className="input"
            value={values.zoomRegisterUrl}
            onChange={(e) => update('zoomRegisterUrl', e.target.value)}
            placeholder="https://us06web.zoom.us/webinar/register/..."
          />
        </Field>
        <Field label="Zoom join URL" hint="Used in {{zoomJoinUrl}}">
          <input
            type="url"
            className="input"
            value={values.zoomJoinUrl}
            onChange={(e) => update('zoomJoinUrl', e.target.value)}
          />
        </Field>
        <Field label="Replay URL" hint="Used in {{replayUrl}}">
          <input
            type="url"
            className="input"
            value={values.replayUrl}
            onChange={(e) => update('replayUrl', e.target.value)}
          />
        </Field>
        <Field
          label="Messenger group URL"
          hint="Used in {{messengerGroupUrl}} + the /registered page"
        >
          <input
            type="url"
            className="input"
            value={values.messengerGroupUrl}
            onChange={(e) => update('messengerGroupUrl', e.target.value)}
            placeholder="https://m.me/j/..."
          />
        </Field>
      </Section>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <span className="text-xs text-slate-500">
          Stored locally in <code>/data/settings.json</code>. Gitignored.
        </span>
        <button
          type="submit"
          disabled={status === 'saving'}
          className="btn btn-primary"
        >
          {status === 'saving'
            ? 'Saving…'
            : status === 'saved'
              ? 'Saved ✓'
              : 'Save settings'}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
