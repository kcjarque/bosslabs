'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { SequenceModel } from '@/lib/db';

/**
 * Sequences panel on the customer profile.
 *
 * Two kinds of membership are shown:
 *   - "via list" — passive, comes from the sequence's list filter.
 *     Cannot be removed from here (would need to change the list filter
 *     or unsubscribe the customer entirely).
 *   - "manual"  — admin explicitly subscribed this customer from this
 *     page. Has an Unsubscribe button.
 *
 * The dropdown lets the admin manually subscribe to any sequence the
 * customer isn't already in.
 */
export function CustomerSequences({
  signupId,
  allSequences,
  viaList,
  manual,
  onSubscribe,
  onUnsubscribe,
}: {
  signupId: string;
  allSequences: SequenceModel[];
  /** Sequences the customer is in because they match the sequence's list. */
  viaList: Array<{ sequence: SequenceModel; listName: string }>;
  /** Sequences the customer was manually subscribed to (with timestamp). */
  manual: Array<{ sequence: SequenceModel; subscribedAt: string }>;
  onSubscribe: (signupId: string, sequenceId: string) => Promise<void>;
  onUnsubscribe: (signupId: string, sequenceId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pickedSequenceId, setPickedSequenceId] = useState('');
  const [isPending, startTransition] = useTransition();

  // Already-subscribed (any path) — used to filter the picker.
  const alreadyIn = new Set([
    ...viaList.map((v) => v.sequence.id),
    ...manual.map((m) => m.sequence.id),
  ]);
  const subscribable = allSequences.filter((s) => s.active && !alreadyIn.has(s.id));

  return (
    <section className="card">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-slate-900">Email sequences</h2>
        <span className="text-xs text-slate-500">
          {viaList.length + manual.length} subscribed
        </span>
      </div>

      {/* Current memberships */}
      {viaList.length === 0 && manual.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">
          Not subscribed to any sequence yet.
        </p>
      )}

      {(viaList.length > 0 || manual.length > 0) && (
        <ul className="mt-3 space-y-2">
          {viaList.map(({ sequence, listName }) => (
            <li
              key={`list-${sequence.id}`}
              className="flex items-start justify-between gap-3 rounded-md border border-slate-100 bg-slate-50/40 p-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/sequences/${sequence.id}`}
                  className="text-sm font-medium text-slate-900 hover:underline"
                >
                  {sequence.name}
                </Link>
                <div className="mt-0.5 text-xs text-slate-500">
                  Via list: <span className="font-medium">{listName}</span>
                </div>
              </div>
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-medium text-cyan-700">
                list filter
              </span>
            </li>
          ))}
          {manual.map(({ sequence, subscribedAt }) => (
            <li
              key={`manual-${sequence.id}`}
              className="flex items-start justify-between gap-3 rounded-md border border-slate-100 bg-slate-50/40 p-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/sequences/${sequence.id}`}
                  className="text-sm font-medium text-slate-900 hover:underline"
                >
                  {sequence.name}
                </Link>
                <div className="mt-0.5 text-xs text-slate-500">
                  Subscribed{' '}
                  {new Date(subscribedAt).toLocaleString('en-PH', {
                    timeZone: 'Asia/Manila',
                  })}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                  manual
                </span>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  disabled={isPending}
                  onClick={() => {
                    if (!confirm(`Unsubscribe from "${sequence.name}"?`)) return;
                    startTransition(async () => {
                      await onUnsubscribe(signupId, sequence.id);
                      router.refresh();
                    });
                  }}
                >
                  Unsubscribe
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Subscribe form */}
      {subscribable.length === 0 ? (
        <p className="mt-4 text-xs text-slate-400">
          {allSequences.length === 0
            ? 'No active sequences exist yet. Create one in /admin/sequences.'
            : 'Subscribed to every active sequence.'}
        </p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
          <select
            className="select"
            value={pickedSequenceId}
            onChange={(e) => setPickedSequenceId(e.target.value)}
          >
            <option value="">Pick a sequence to subscribe…</option>
            {subscribable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!pickedSequenceId || isPending}
            onClick={() => {
              const sid = pickedSequenceId;
              startTransition(async () => {
                await onSubscribe(signupId, sid);
                setPickedSequenceId('');
                router.refresh();
              });
            }}
          >
            Subscribe
          </button>
        </div>
      )}
    </section>
  );
}
