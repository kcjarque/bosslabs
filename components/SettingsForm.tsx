'use client';

import { useState } from 'react';
import type { Settings, EventModel } from '@/lib/db';

export function SettingsForm({
  initial,
  events,
}: {
  initial: Settings;
  events: EventModel[];
}) {
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
        title="Active event"
        description="Which event new signups attach to. The checkout + registration flow tags every new signup with this event so lists scoped to a specific event know who belongs."
      >
        <Field
          label="Current event"
          hint="Change this when you start promoting a new webinar. Past signups keep their original event tag."
        >
          <select
            className="select"
            value={values.activeEventId ?? ''}
            onChange={(e) => update('activeEventId', e.target.value || null)}
          >
            <option value="">— No active event (signups untagged) —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

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
        title="Email"
        description="Choose who sends outbound mail. From name/email apply to both providers."
      >
        <Field
          label="Provider"
          hint="Amazon SES uses env vars (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION) — no key needed here."
        >
          <select
            className="input"
            value={values.emailProvider === 'ses' ? 'ses' : 'resend'}
            onChange={(e) => update('emailProvider', e.target.value)}
          >
            <option value="resend">Resend</option>
            <option value="ses">Amazon SES</option>
          </select>
        </Field>
        <Field label="Resend API Key" hint="re_… · only used when provider is Resend · blank to keep current">
          <input
            type="password"
            autoComplete="new-password"
            className="input"
            value={values.resendApiKey}
            onChange={(e) => update('resendApiKey', e.target.value)}
            placeholder="••••••••  (stored — blank to keep)"
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
        <Field
          label="Reply-To email"
          hint="A real, monitored inbox — 'no-reply' addresses tank Gmail deliverability."
        >
          <input
            type="email"
            className="input"
            value={values.resendReplyTo}
            onChange={(e) => update('resendReplyTo', e.target.value)}
            placeholder="hello@conexmedia.ph"
          />
        </Field>
        <TestSendPanel channel="email" placeholder="you@yourbiz.com" />
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
          <Field label="API password" hint="Leave blank to keep current">
            <input
              type="password"
              autoComplete="new-password"
              className="input"
              value={values.onewaysmsPassword}
              onChange={(e) => update('onewaysmsPassword', e.target.value)}
              placeholder="••••••••  (stored — blank to keep)"
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
        <TestSendPanel channel="sms" placeholder="+639171234567" />
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

      <Section
        title="Telegram notifications"
        description="Real-time alerts to a Telegram group chat when someone pays or abandons checkout, plus a daily summary."
      >
        <Field
          label="Bot Token"
          hint="Create a bot via @BotFather → /newbot. Leave blank to keep current."
        >
          <input
            type="password"
            autoComplete="new-password"
            className="input"
            value={values.telegramBotToken}
            onChange={(e) => update('telegramBotToken', e.target.value)}
            placeholder="••••••••  (stored — blank to keep)"
          />
        </Field>
        <Field
          label="Chat ID"
          hint="The group chat ID (e.g. -100…). Add the bot to your group, then use @RawDataBot or the getUpdates API to find it."
        >
          <input
            type="text"
            className="input"
            value={values.telegramChatId}
            onChange={(e) => update('telegramChatId', e.target.value)}
            placeholder="-1001234567890"
          />
        </Field>
        <TelegramTestPanel />
      </Section>

      <Section title="Admin account" description="Email tied to this admin login.">
        <Field label="Admin email" hint="Email associated with this admin account.">
          <input
            type="email"
            className="input"
            value={values.adminEmail}
            onChange={(e) => update('adminEmail', e.target.value)}
            placeholder="you@bosslabs.live"
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
          Secrets masked in transit — leave blank to keep the stored value.
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

/**
 * TelegramTestPanel — sends a test message via the saved Telegram settings.
 */
function TelegramTestPanel() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
  const [detail, setDetail] = useState('');

  async function send() {
    setStatus('sending');
    setDetail('');
    try {
      const res = await fetch('/api/admin/test-telegram', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setStatus('fail');
        setDetail(data.error || `HTTP ${res.status}`);
        return;
      }
      setStatus('ok');
      setDetail('Message sent to group chat.');
    } catch (err) {
      setStatus('fail');
      setDetail(err instanceof Error ? err.message : 'Network error');
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        Diagnostic
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <button
          type="button"
          onClick={send}
          disabled={status === 'sending'}
          className="btn btn-secondary whitespace-nowrap"
        >
          {status === 'sending' ? 'Sending…' : 'Send test message'}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Uses the currently <strong>saved</strong> bot token and chat ID.
        Save settings first if you just changed them.
      </p>
      {status === 'ok' && (
        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
          ✓ {detail}
        </div>
      )}
      {status === 'fail' && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          ✗ {detail}
        </div>
      )}
    </div>
  );
}

/**
 * TestSendPanel — inline diagnostic UI under each channel section.
 *
 * Uses the CURRENTLY-SAVED settings (not whatever's in the dirty form
 * inputs), so the admin should Save first if they just rotated keys.
 * Result message persists until the admin types again or fires another
 * test — long enough to read and screenshot if needed.
 */
function TestSendPanel({
  channel,
  placeholder,
}: {
  channel: 'email' | 'sms';
  placeholder: string;
}) {
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
  const [detail, setDetail] = useState<string>('');

  async function send() {
    const target = to.trim();
    if (!target) {
      setStatus('fail');
      setDetail('Enter a recipient first.');
      return;
    }
    setStatus('sending');
    setDetail('');
    try {
      const res = await fetch('/api/admin/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, to: target }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        provider?: string;
        id?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setStatus('fail');
        setDetail(data.error || `HTTP ${res.status}`);
        return;
      }
      setStatus('ok');
      setDetail(
        data.provider === 'demo'
          ? `Demo mode (no provider configured) — saved to server logs only.`
          : `Sent via ${data.provider}${data.id ? ` · ${data.id}` : ''}`,
      );
    } catch (err) {
      setStatus('fail');
      setDetail(err instanceof Error ? err.message : 'Network error');
    }
  }

  const label =
    channel === 'email' ? 'Send test email to' : 'Send test SMS to';

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        Diagnostic
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <input
          type={channel === 'email' ? 'email' : 'tel'}
          inputMode={channel === 'email' ? 'email' : 'tel'}
          autoComplete="off"
          className="input flex-1"
          aria-label={label}
          placeholder={placeholder}
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            if (status !== 'idle') setStatus('idle');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (status !== 'sending') send();
            }
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={status === 'sending'}
          className="btn btn-secondary whitespace-nowrap sm:w-auto"
        >
          {status === 'sending' ? 'Sending…' : 'Send test'}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Uses the currently <strong>saved</strong> credentials. If you just
        edited the API key above, click Save settings first, then test.
      </p>
      {status === 'ok' && (
        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
          ✓ {detail}
        </div>
      )}
      {status === 'fail' && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          ✗ {detail}
        </div>
      )}
    </div>
  );
}
