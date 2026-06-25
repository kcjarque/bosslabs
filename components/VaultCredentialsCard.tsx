'use client';

import Link from 'next/link';
import { useState } from 'react';

type HubAccount = {
  email: string;
  password: string | null;
  existed?: boolean;
};

/**
 * Shows the buyer's BossLabs Hub credentials. Three states:
 *   1. Has password (first-time provisioning) → show username + password with
 *      copy buttons + a primary CTA to log in
 *   2. Has username but no password (webhook re-fire / already provisioned) →
 *      show username + tell them to check the original email
 *   3. No hubAccount yet (webhook still racing — rare) → show pending state
 *      with their checkout email and tell them to check inbox in 1-2 min
 */
export function VaultCredentialsCard({
  hub,
  buyerEmail,
}: {
  hub?: HubAccount;
  buyerEmail: string;
}) {
  // State 3 — webhook hasn't fired yet (very rare; only if the user reached
  // the thank-you page faster than the webhook processed).
  if (!hub) {
    return (
      <div className="rounded-3xl border border-cyan-400/30 bg-cyan-500/[0.04] p-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
          Your Hub login
        </div>
        <p className="mt-3 text-[14px] leading-[1.6] text-ink-100">
          We&rsquo;re creating your Hub account right now — your credentials will land in your inbox
          at <strong className="text-white">{buyerEmail || 'your email'}</strong> within a minute or
          two. Refresh this page after a moment to see them here, or just check your inbox.
        </p>
      </div>
    );
  }

  return <CredentialsReady hub={hub} />;
}

function CredentialsReady({ hub }: { hub: HubAccount }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<'email' | 'password' | null>(null);

  const copy = async (text: string, what: 'email' | 'password') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore — buttons stay idle */
    }
  };

  const reFire = hub.password == null;

  return (
    <div className="rounded-3xl border border-cyan-400/40 bg-gradient-to-b from-cyan-500/[0.10] via-white/[0.02] to-transparent p-6 shadow-[0_28px_80px_-30px_rgba(0,184,230,0.45)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
        Your Hub login
      </div>
      <div className="mt-3 space-y-3">
        {/* Username (email) */}
        <CredentialRow label="Username (email)" value={hub.email} onCopy={() => copy(hub.email, 'email')} copied={copied === 'email'} mono />

        {/* Password */}
        {reFire ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.05] p-3 text-[13px] leading-[1.55] text-amber-100">
            <strong className="text-amber-50">We already created this account.</strong> Your password
            was sent to <span className="font-semibold">{hub.email}</span> the first time you bought.
            Check that inbox — or reset it from the Hub login page.
          </div>
        ) : (
          <CredentialRow
            label="Password"
            value={hub.password!}
            onCopy={() => copy(hub.password!, 'password')}
            copied={copied === 'password'}
            mono
            masked={!revealed}
            onReveal={() => setRevealed(true)}
            revealed={revealed}
          />
        )}
      </div>

      {/* Primary CTA */}
      <a
        href="https://bosslabs-hub.vercel.app/login"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 px-7 py-3.5 text-base font-semibold text-white shadow-[0_18px_44px_-12px_rgba(0,150,200,0.7)] transition hover:from-cyan-400 hover:to-indigo-400 active:translate-y-[1px]"
      >
        Log in to the BossLabs Hub →
      </a>

      <p className="mt-3 text-center text-[11.5px] text-ink-400">
        Bookmark{' '}
        <Link href="https://bosslabs-hub.vercel.app" className="underline-offset-2 hover:underline">
          bosslabs-hub.vercel.app
        </Link>{' '}
        — it&rsquo;s where the whole Hub lives.
      </p>
    </div>
  );
}

function CredentialRow({
  label,
  value,
  onCopy,
  copied,
  mono,
  masked,
  onReveal,
  revealed,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  mono?: boolean;
  masked?: boolean;
  onReveal?: () => void;
  revealed?: boolean;
}) {
  const displayedValue = masked ? '•'.repeat(Math.max(8, value.length)) : value;
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.18em] text-ink-400">{label}</div>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/15 bg-[#06070A]/60 p-2 pl-3">
        <code
          className={`flex-1 truncate text-[14.5px] text-white ${mono ? 'font-mono tracking-[0.04em]' : ''}`}
        >
          {displayedValue}
        </code>
        {masked && onReveal && (
          <button
            type="button"
            onClick={onReveal}
            className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-200 hover:bg-white/[0.04]"
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
        <button
          type="button"
          onClick={onCopy}
          className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] transition ${
            copied
              ? 'border-emerald-400/60 bg-emerald-500/[0.18] text-emerald-100'
              : 'border-cyan-400/50 bg-cyan-500/[0.10] text-cyan-100 hover:bg-cyan-500/[0.18]'
          }`}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
