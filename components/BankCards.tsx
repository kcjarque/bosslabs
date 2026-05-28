'use client';

import { useState } from 'react';

type Bank = { method: string; name: string; number: string };

const LOGO_TINT: Record<string, string> = {
  BPI: 'from-red-500 to-rose-600',
  BDO: 'from-blue-600 to-indigo-700',
  Maya: 'from-emerald-500 to-teal-600',
};

export function BankCards({
  banks,
  highlight,
}: {
  banks: Bank[];
  highlight?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {banks.map((b) => (
        <Card key={b.method} bank={b} featured={b.method === highlight} />
      ))}
    </div>
  );
}

function Card({ bank, featured }: { bank: Bank; featured: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(bank.number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-white p-5 shadow-[0_12px_36px_-24px_rgba(20,50,90,0.4)] transition ${
        featured ? 'border-cyan-400 ring-2 ring-cyan-500/20' : 'border-slate-200'
      }`}
    >
      {featured && (
        <span className="absolute right-3 top-3 rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-700">
          Your choice
        </span>
      )}
      <div
        className={`inline-flex h-9 items-center rounded-lg bg-gradient-to-r px-3 text-sm font-bold text-white ${
          LOGO_TINT[bank.method] ?? 'from-slate-500 to-slate-700'
        }`}
      >
        {bank.method}
      </div>
      <div className="mt-4 text-[11px] uppercase tracking-[0.16em] text-slate-400">
        Account name
      </div>
      <div className="text-sm font-medium text-slate-900">{bank.name}</div>
      <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-slate-400">
        Account number
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-base text-slate-900">{bank.number}</span>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-cyan-400 hover:text-cyan-700"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
