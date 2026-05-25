'use client';

/**
 * ShareCard — copyable share URL + 1-tap socials. Lives on /accepted.
 *
 * Each network gets a direct share URL (no JS SDKs, no tracking pixels).
 * The copy button writes the URL to the clipboard and flashes a "Copied"
 * confirmation so the user can paste into any other channel.
 */

import { useState } from 'react';

export function ShareCard({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);

  const fbShare = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  // Messenger share requires a Facebook App ID. Without it, fall back to a
  // simple m.me deep link that opens Messenger so the user can paste into
  // a chat manually. Cleaner than a broken share dialog.
  const messengerShare = `https://www.messenger.com/`;
  const twitterShare = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older Safari / non-secure context — show a prompt as the fallback
      // so the user can still copy manually.
      window.prompt('Copy this link:', url);
    }
  }

  return (
    <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.04] p-5 sm:p-6">
      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-400 sm:text-[11px]">
        Your share link
      </div>

      {/* URL + Copy button — primary action sits on its own row so it's
          finger-tap sized on mobile. */}
      <div className="mt-3 flex items-stretch gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Share URL"
          className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-[12px] text-ink-100 outline-none sm:text-[13px]"
        />
        <button
          type="button"
          onClick={copyLink}
          className="flex-none rounded-lg bg-cyan-500 px-4 py-2 text-[12px] font-semibold text-[#06070A] transition hover:bg-cyan-400 sm:text-[13px]"
        >
          {copied ? '✓ Copied' : 'Copy link'}
        </button>
      </div>

      {/* 1-tap social buttons */}
      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <ShareButton href={fbShare} label="Facebook" icon={<FbIcon />} />
        <ShareButton href={messengerShare} label="Messenger" icon={<MsgrIcon />} />
        <ShareButton href={twitterShare} label="Twitter" icon={<XIcon />} />
      </div>

      <p className="mt-3 text-[11px] leading-snug text-ink-300 sm:text-[12px]">
        One smart friend is enough. The room shifts when builders show up together.
      </p>
    </div>
  );
}

function ShareButton({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[12px] font-medium text-ink-100 transition hover:border-cyan-500/40 hover:bg-cyan-500/[0.08] hover:text-white sm:text-[13px]"
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}

function FbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5 3.66 9.16 8.44 9.94V14.9H7.9v-2.84h2.54V9.85c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.77l-.44 2.84h-2.33v7.1C18.34 21.22 22 17.06 22 12.06Z" />
    </svg>
  );
}

function MsgrIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.06 2 11.07c0 2.83 1.43 5.35 3.66 7.01v4.04l3.35-1.84c.95.26 1.95.4 2.99.4 5.52 0 10-4.06 10-9.06S17.52 2 12 2Zm1.04 12.16-2.55-2.72-4.96 2.72 5.45-5.78 2.61 2.72 4.91-2.72-5.46 5.78Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2H21.5l-7.5 8.56L23 22h-6.86l-5.36-7-6.13 7H1.4l8.02-9.16L1 2h7.04l4.85 6.41L18.244 2Zm-1.2 18h1.9L7.05 4H5.04l12 16Z" />
    </svg>
  );
}
