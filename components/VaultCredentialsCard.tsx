'use client';

import Link from 'next/link';
import { useState } from 'react';

type HubAccount = {
  email: string;
  password: string | null;
  existed?: boolean;
};

/**
 * Shows the buyer's BossLabs Hub credentials. Four states:
 *   1. Has password + tokenValid → show username + password with copy buttons +
 *      primary CTA to log in (first-time provisioning, fresh redirect from /oto)
 *   2. Has password but tokenValid=false (URL leak / bookmark without ?t=) →
 *      show username only, tell them to use "Forgot password" on the Hub
 *   3. Has username but no password (webhook re-fire / already provisioned) →
 *      show username + tell them to check the original email or reset
 *   4. No hubAccount yet (webhook still racing — rare) → pending state with
 *      their checkout email
 *
 * `tokenValid` is the result of HMAC-verifying ?t= against the order id on the
 * server. Without it, anyone with the order id could fetch the password — the
 * page server-renders, so checking on the server is the only honest gate.
 */
export function VaultCredentialsCard({
  hub,
  buyerEmail,
  tokenValid,
}: {
  hub?: HubAccount;
  buyerEmail: string;
  tokenValid?: boolean;
}) {
  // State 4 — webhook hasn't fired yet (very rare; only if the user reached
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

  // States 1–3 below. CredentialsReady masks the password when tokenValid is
  // false so a leaked or guessed order id alone never exposes credentials.
  return <CredentialsReady hub={hub} tokenValid={tokenValid !== false} />;
}

function CredentialsReady({ hub, tokenValid }: { hub: HubAccount; tokenValid: boolean }) {
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

  // Treat any non-token visit the same as a re-fire: hide the password and
  // route the buyer to password reset. The password may exist in the DB, but
  // the page must not render it without a valid token.
  const reFire = hub.password == null || !tokenValid;

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
            <strong className="text-amber-50">For your security, the password is shown only on the
            success page right after checkout.</strong> Open the Hub at{' '}
            <a
              href="https://bosslabs-hub.vercel.app/login"
              className="font-semibold underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              bosslabs-hub.vercel.app/login
            </a>{' '}
            and use <em>Forgot password</em> with <span className="font-semibold">{hub.email}</span> —
            we&rsquo;ll email a reset link.
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
