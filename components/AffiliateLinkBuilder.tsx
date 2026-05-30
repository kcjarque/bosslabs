'use client';

import { useState } from 'react';
import { CopyButton } from './CopyButton';

const DESTS = [
  { label: 'Homepage', path: '/' },
  { label: 'Checkout (₱999)', path: '/checkout' },
  { label: 'VibeCode Retreat', path: '/vibecode-retreat' },
];

/** Lets affiliates build a deep link to any page + a campaign tag (?sub=) so
 *  they can see which post/ad converts. */
export function AffiliateLinkBuilder({ base, code }: { base: string; code: string }) {
  const [path, setPath] = useState('/');
  const [sub, setSub] = useState('');
  const cleanSub = sub.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const url = `${base}${path}?ref=${code}${cleanSub ? `&sub=${cleanSub}` : ''}`;

  const input =
    'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500';

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <select className={input} value={path} onChange={(e) => setPath(e.target.value)}>
          {DESTS.map((d) => (
            <option key={d.path} value={d.path}>
              Send to: {d.label}
            </option>
          ))}
        </select>
        <input
          className={input}
          value={sub}
          onChange={(e) => setSub(e.target.value)}
          placeholder="Campaign tag — e.g. igreel1 (optional)"
        />
      </div>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-3">
        <span className="break-all font-mono text-xs text-slate-700">{url}</span>
        <span className="flex-none">
          <CopyButton text={url} label="Copy" />
        </span>
      </div>
    </div>
  );
}
