'use client';

import { useState } from 'react';

/** A link display with a one-tap "Copy" button + copied feedback. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API blocked (insecure context / old browser) — fall back
      // to a hidden textarea + execCommand.
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* give up silently */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="break-all font-mono text-base text-slate-900">{url}</span>
      <button
        type="button"
        onClick={copy}
        className={`flex-none rounded-full px-4 py-2 text-sm font-medium transition ${
          copied
            ? 'bg-emerald-500 text-white'
            : 'bg-cyan-600 text-white hover:bg-cyan-500'
        }`}
      >
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  );
}
