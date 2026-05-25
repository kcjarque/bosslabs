'use client';

/**
 * TemplatesTabs — pill tabs at the top of /admin/templates that switch
 * between the existing Email and SMS editors. The editors themselves
 * (EmailTemplatesEditor / SmsTemplatesEditor) stay unchanged — this is
 * a thin wrapper that just controls which one is mounted.
 *
 * Tab state is mirrored to ?tab=... via history.replaceState so the URL
 * is shareable but switching tabs doesn't push a new history entry every
 * click (would clutter the back-button stack).
 */

import { useState } from 'react';
import type { EmailTemplate, SmsTemplate } from '@/lib/db';
import { EmailTemplatesEditor } from './EmailTemplatesEditor';
import { SmsTemplatesEditor } from './SmsTemplatesEditor';

type Tab = 'email' | 'sms';

export function TemplatesTabs({
  initialTab,
  emailTemplates,
  smsTemplates,
}: {
  initialTab: Tab;
  emailTemplates: EmailTemplate[];
  smsTemplates: SmsTemplate[];
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  function select(next: Tab) {
    if (next === tab) return;
    setTab(next);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.replaceState(null, '', url.toString());
    }
  }

  return (
    <div className="space-y-5">
      {/* Tab strip — segmented control. Active tab gets the dark fill so it
          reads as the "you are here" state without needing a label. */}
      <div
        role="tablist"
        aria-label="Template type"
        className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm"
      >
        <TabButton active={tab === 'email'} onClick={() => select('email')} label={`Email (${emailTemplates.length})`} controls="tabpanel-email" id="tab-email" />
        <TabButton active={tab === 'sms'} onClick={() => select('sms')} label={`SMS (${smsTemplates.length})`} controls="tabpanel-sms" id="tab-sms" />
      </div>

      {tab === 'email' ? (
        <div role="tabpanel" id="tabpanel-email" aria-labelledby="tab-email">
          <EmailTemplatesEditor initial={emailTemplates} />
        </div>
      ) : (
        <div role="tabpanel" id="tabpanel-sms" aria-labelledby="tab-sms">
          <SmsTemplatesEditor initial={smsTemplates} />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  controls,
  id,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  controls: string;
  id: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active
          ? 'bg-slate-900 text-white shadow-sm'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );
}
