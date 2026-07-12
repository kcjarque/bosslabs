'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { DfyRetainerClient } from '@/lib/dfy-crm';

const peso = (c: number) => `₱${Math.round(c / 100).toLocaleString('en-PH')}`;

/**
 * Wraps the dashboard "Monthly retainer" StatCard, turning it into a
 * click-to-open trigger. The modal breaks the MRR total down per client —
 * each active DFY retainer client, their retainer /mo, and a deep link to
 * that client's DFY Ops project. Data is passed in from the (cached) server
 * fetch, so opening the modal is instant and does no extra request.
 */
export function RetainerBreakdown({
  clients,
  children,
}: {
  clients: DfyRetainerClient[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const total = clients.reduce((s, c) => s + c.retainerCentavos, 0);
  const count = clients.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group block w-full text-left"
        aria-label="View monthly retainer clients"
      >
        {children}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Monthly retainer clients</h2>
                <p className="mt-0.5 text-[12.5px] text-slate-500">
                  <strong className="text-emerald-700">{peso(total)}/mo</strong> across {count} active{' '}
                  {count === 1 ? 'client' : 'clients'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-1 -mt-1 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {count === 0 ? (
              <p className="mt-4 text-[13px] text-slate-500">
                No active DFY clients on a monthly retainer yet. Set a retainer on a Closed-Deal card
                in the DFY board and it shows up here.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {clients.map((c) => (
                  <li key={c.cardId} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium text-slate-900">
                        {c.customerName}
                      </div>
                      {c.projects.length > 0 ? (
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                          {c.projects.map((p) => (
                            <Link
                              key={p.id}
                              href={`/admin/dfy/${p.id}`}
                              className="text-[11.5px] text-cyan-600 hover:underline"
                            >
                              {p.name} →
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11.5px] text-slate-400">No DFY Ops project yet</span>
                      )}
                    </div>
                    <div className="tnum shrink-0 text-[13.5px] font-semibold text-slate-900">
                      {peso(c.retainerCentavos)}
                      <span className="text-[11px] font-normal text-slate-400">/mo</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
