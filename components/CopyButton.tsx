'use client';

import { useState } from 'react';

/** A button that copies arbitrary text + shows "Copied!" feedback. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        copied ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-slate-700'
      }`}
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}
