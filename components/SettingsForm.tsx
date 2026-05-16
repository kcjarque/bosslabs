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
        title="Webinar"
        description="These flow into the landing page (hero, host CTA, final countdown) and every email + SMS template variable. Editable live — no redeploy."
      >
        <Field label="Webinar name" hint="Used in email + SMS subjects and the thank-you page detail card.">
          <input
            type="text"
            className="input"
            value={values.webinarName}
            onChange={(e) => update('webinarName', e.target.value)}
            placeholder="AI Coding 101 — The BOSSLABS AI Webinar"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr_0.7fr]">
          <Field label="Date (display)" hint="Free text — whatever reads well on the page.">
            <input
              type="text"
              className="input"
              value={values.webinarDate}
              onChange={(e) => update('webinarDate', e.target.value)}
              placeholder="May 21, 2026"
            />
          </Field>
          <Field label="Time (display)">
            <input
              type="text"
              className="input"
              value={values.webinarTime}
              onChange={(e) => update('webinarTime', e.target.value)}
              placeholder="8:00 PM"
            />
          </Field>
          <Field label="Timezone">
            <input
              type="text"
              className="input"
              value={values.webinarTimezone}
              onChange={(e) => update('webinarTimezone', e.target.value)}
              placeholder="PHT"
            />
          </Field>
        </div>
        <Field
          label="Countdown ISO timestamp"
          hint="What the red countdown bar ticks toward. Must be ISO 8601 with a timezone (e.g. 2026-05-21T20:00:00+08:00). Leave blank for a +14-day fallback."
        >
          <input
            type="text"
            className="input"
            value={values.webinarStartsAtIso}
            onChange={(e) => update('webinarStartsAtIso', e.target.value)}
            placeholder="2026-05-21T20:00:00+08:00"
          />
        </Field>
      </Section>

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
