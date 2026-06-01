'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Signup, SignupStatus, SequenceModel } from '@/lib/db';
import { EventPill } from './EventPill';

/**
 * Status filter buckets — the user-facing labels we group statuses into,
 * not the raw SignupStatus enum. "Paid" includes both paid + attended.
 */
type StatusFilter = 'all' | 'paid' | 'abandoned' | 'refunded' | 'unsubscribed';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'abandoned', label: 'Abandoned' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'unsubscribed', label: 'Unsubscribed' },
];

function inFilter(status: SignupStatus, f: StatusFilter): boolean {
  if (f === 'all') return true;
  if (f === 'paid') return status === 'paid' || status === 'attended';
  if (f === 'abandoned') return status === 'registered';
  if (f === 'refunded') return status === 'refunded';
  if (f === 'unsubscribed') return status === 'unsubscribed';
  return true;
}

function paymentMethodLabel(s: Signup): string {
  const m = (s.metadata as { paymentMethodGroup?: string } | undefined)?.paymentMethodGroup;
  if (!m || m === 'ALL') return '—';
  if (m === 'CREDIT_CARD') return 'Card';
  if (m === 'GCASH') return 'GCash';
  if (m === 'BANKS') return 'Banks';
  return m;
}

function methodPillClass(s: Signup): string {
  const m = (s.metadata as { paymentMethodGroup?: string } | undefined)?.paymentMethodGroup;
  if (m === 'GCASH') return 'pill pill-cyan';
  if (m === 'CREDIT_CARD') return 'pill pill-violet';
  if (m === 'BANKS') return 'pill pill-amber';
  return 'pill';
}

/** Total the customer actually paid = main amount + any confirmed OTO upsell.
 *  The OTO is a separate invoice, so its (PHP) amount lives in
 *  metadata.otoAmount — amountCentavos only ever holds the main ticket price.
 *  Same gate (otoConfirmed) the dashboard uses for revenue, so totals match. */
function totalPaidCentavos(s: Signup): number | null {
  if (s.amountCentavos == null) return null;
  const meta = s.metadata as { otoAmount?: number; otoConfirmed?: string } | undefined;
  const otoCentavos =
    meta?.otoConfirmed && typeof meta.otoAmount === 'number'
      ? Math.round(meta.otoAmount * 100)
      : 0;
  return s.amountCentavos + otoCentavos;
}

type TemplateRef = { id: string; name: string };

export function SignupsTable({
  initial,
  eventNameById = {},
  sequences = [],
  emailTemplates = [],
  smsTemplates = [],
  onBulkSubscribe,
  onBulkDelete,
  onBulkSend,
}: {
  initial: Signup[];
  eventNameById?: Record<string, string>;
  sequences?: SequenceModel[];
  emailTemplates?: TemplateRef[];
  smsTemplates?: TemplateRef[];
  onBulkSubscribe?: (
    signupIds: string[],
    sequenceId: string,
  ) => Promise<{ subscribed: number; skipped: number }>;
  onBulkDelete?: (signupIds: string[]) => Promise<{ count: number }>;
  onBulkSend?: (
    signupIds: string[],
    channel: 'email' | 'sms',
    templateId: string,
  ) => Promise<{ sent: number; failed: number; noPhone: number }>;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSeqId, setBulkSeqId] = useState('');
  const [bulkChannel, setBulkChannel] = useState<'email' | 'sms'>('email');
  const [bulkTemplateId, setBulkTemplateId] = useState('');
  const [isPending, startTransition] = useTransition();

  // Progressive bulk-send state — keeps the UI responsive instead of
  // blocking on a single long server action. The user can keep scrolling,
  // opening profiles, etc. while emails go out batch-by-batch.
  type BulkSendProgress = {
    total: number;
    done: number;
    sent: number;
    failed: number;
    noPhone: number;
    channel: 'email' | 'sms';
    templateId: string;
    status: 'sending' | 'done';
  };
  const [bulkSendProgress, setBulkSendProgress] =
    useState<BulkSendProgress | null>(null);

  async function startBulkSend(
    ids: string[],
    channel: 'email' | 'sms',
    templateId: string,
  ) {
    if (!onBulkSend) return;
    const BATCH = 5; // server still does N sequentially internally; smaller
    // batches mean snappier progress updates + faster failover.
    setBulkSendProgress({
      total: ids.length,
      done: 0,
      sent: 0,
      failed: 0,
      noPhone: 0,
      channel,
      templateId,
      status: 'sending',
    });

    let done = 0;
    let sent = 0;
    let failed = 0;
    let noPhone = 0;

    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      try {
        const res = await onBulkSend(batch, channel, templateId);
        sent += res.sent;
        failed += res.failed;
        noPhone += res.noPhone;
      } catch (err) {
        // Treat whole batch as failed if the server call itself rejected.
        failed += batch.length;
      }
      done += batch.length;
      // setState inside the loop is fine — React batches DOM updates and
      // each chunk is awaited so we don't fire setState faster than render.
      setBulkSendProgress((prev) =>
        prev ? { ...prev, done, sent, failed, noPhone } : prev,
      );
    }

    setBulkSendProgress((prev) => (prev ? { ...prev, status: 'done' } : prev));
    router.refresh();
  }

  function openCustomer(id: string) {
    router.push(`/admin/customers/${id}`);
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(ids: string[], checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) ids.forEach((i) => next.add(i));
      else ids.forEach((i) => next.delete(i));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const filtered = useMemo(() => {
    return initial.filter((s) => {
      if (!inFilter(s.status, filter)) return false;
      if (!q) return true;
      const hay = `${s.firstName} ${s.lastName ?? ''} ${s.email} ${s.phone}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [initial, filter, q]);

  const filteredIds = useMemo(() => filtered.map((s) => s.id), [filtered]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const bulkSupported = Boolean(onBulkSubscribe || onBulkDelete || onBulkSend);
  const activeSequences = sequences.filter((s) => s.active);
  const bulkTemplates = bulkChannel === 'email' ? emailTemplates : smsTemplates;

  return (
    <>
      {/* Filters */}
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                filter === f.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email, phone…"
          className="input sm:max-w-xs sm:flex-1"
        />
      </div>

      {/* Bulk action bar — sticky at top once selections exist. */}
      {bulkSupported && selectedIds.size > 0 && (
        <div className="sticky top-0 z-30 card space-y-3 border-cyan-200 bg-cyan-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium text-slate-900">
              {selectedIds.size} selected
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={clearSelection}
              disabled={isPending}
            >
              Clear
            </button>
          </div>

          {/* Send row — channel + template + send button. */}
          {onBulkSend && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1">
                {(['email', 'sms'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setBulkChannel(c);
                      setBulkTemplateId('');
                    }}
                    className={`rounded-md px-3 py-1.5 text-sm capitalize transition ${
                      bulkChannel === c
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <select
                className="select sm:flex-1"
                value={bulkTemplateId}
                onChange={(e) => setBulkTemplateId(e.target.value)}
              >
                <option value="">
                  {bulkTemplates.length === 0
                    ? `No ${bulkChannel} templates yet`
                    : `Pick a ${bulkChannel} template…`}
                </option>
                {bulkTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary"
                // Disable only while another bulk send is actively running.
                // The user can still browse / select / etc. — the toast
                // keeps progress visible at the corner of the screen.
                disabled={
                  !bulkTemplateId ||
                  bulkSendProgress?.status === 'sending'
                }
                onClick={() => {
                  const ids = Array.from(selectedIds);
                  const channel = bulkChannel;
                  const tid = bulkTemplateId;
                  const n = ids.length;
                  if (
                    !confirm(
                      `Send ${channel} to ${n} customer${n === 1 ? '' : 's'} using template "${tid}"?`,
                    )
                  )
                    return;
                  // Clear the selection + template picker right away so the
                  // user can keep doing other things. The send runs in the
                  // background and shows progress in the floating toast.
                  setBulkTemplateId('');
                  clearSelection();
                  void startBulkSend(ids, channel, tid);
                }}
              >
                Send
              </button>
            </div>
          )}

          {/* Subscribe + delete row. */}
          <div className="flex flex-wrap items-center gap-2">
            {onBulkSubscribe && activeSequences.length > 0 && (
              <>
                <select
                  className="select sm:w-auto sm:flex-1"
                  value={bulkSeqId}
                  onChange={(e) => setBulkSeqId(e.target.value)}
                >
                  <option value="">Subscribe to sequence…</option>
                  {activeSequences.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!bulkSeqId || isPending}
                  onClick={() => {
                    const ids = Array.from(selectedIds);
                    const sid = bulkSeqId;
                    startTransition(async () => {
                      const res = await onBulkSubscribe(ids, sid);
                      const lines: string[] = [];
                      lines.push(
                        `Subscribed ${res.subscribed} customer${res.subscribed === 1 ? '' : 's'}.`,
                      );
                      if (res.skipped > 0) {
                        lines.push(
                          `Skipped ${res.skipped} already subscribed (via list or manual).`,
                        );
                      }
                      alert(lines.join('\n'));
                      setBulkSeqId('');
                      clearSelection();
                      router.refresh();
                    });
                  }}
                >
                  Subscribe
                </button>
              </>
            )}
            {onBulkDelete && (
              <button
                type="button"
                className="btn btn-secondary text-red-600 hover:bg-red-50"
                disabled={isPending}
                onClick={() => {
                  const n = selectedIds.size;
                  if (
                    !confirm(
                      `Permanently delete ${n} customer${n === 1 ? '' : 's'}? This cascades and deletes their email/SMS/payment history. No undo.`,
                    )
                  )
                    return;
                  const ids = Array.from(selectedIds);
                  startTransition(async () => {
                    const res = await onBulkDelete(ids);
                    alert(`Deleted ${res.count} customer${res.count === 1 ? '' : 's'}.`);
                    clearSelection();
                    router.refresh();
                  });
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mobile: stacked cards. Desktop: table. */}
      <div className="space-y-3 sm:hidden">
        {filtered.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => openCustomer(s.id)}
            className="card block w-full text-left transition hover:border-slate-300"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900">
                  {s.firstName} {s.lastName ?? ''}
                </div>
                <div className="truncate text-xs text-slate-500">{s.email}</div>
                <div className="text-xs text-slate-400">{s.phone}</div>
                {s.amountCentavos != null && (
                  <div className="mt-1 text-xs text-slate-700">
                    ₱{(totalPaidCentavos(s)! / 100).toLocaleString()}
                    {s.bumped && ' · incl. OTO'}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusPill status={s.status} />
                {s.eventId && eventNameById[s.eventId] && (
                  <EventPill name={eventNameById[s.eventId]} />
                )}
                {paymentMethodLabel(s) !== '—' && (
                  <span className={methodPillClass(s)}>{paymentMethodLabel(s)}</span>
                )}
                <span className="text-[10px] text-slate-400">
                  {formatRelative(s.createdAt)}
                </span>
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="card text-center text-sm text-slate-500">
            No signups match this filter.
          </div>
        )}
      </div>

      <div className="card hidden overflow-hidden p-0 sm:block">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                {bulkSupported && (
                  <th className="w-8">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      // ref hack avoids React warning when there's a partial selection
                      ref={(el) => {
                        if (el) {
                          el.indeterminate =
                            filteredIds.some((id) => selectedIds.has(id)) &&
                            !allFilteredSelected;
                        }
                      }}
                      onChange={(e) => toggleAll(filteredIds, e.target.checked)}
                      aria-label="Select all"
                    />
                  </th>
                )}
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Event</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Status</th>
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={(e) => {
                    // Don't navigate when the click target is a checkbox or its cell —
                    // selecting shouldn't open the profile.
                    const target = e.target as HTMLElement;
                    if (target.closest('.bulk-select-cell')) return;
                    openCustomer(s.id);
                  }}
                  className="cursor-pointer"
                >
                  {bulkSupported && (
                    <td
                      className="bulk-select-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={(e) => toggleOne(s.id, e.target.checked)}
                        aria-label={`Select ${s.firstName}`}
                      />
                    </td>
                  )}
                  <td className="font-medium text-slate-900">
                    {s.firstName} {s.lastName ?? ''}
                  </td>
                  <td>{s.email}</td>
                  <td className="text-slate-500">{s.phone}</td>
                  <td>
                    {s.eventId && eventNameById[s.eventId] ? (
                      <EventPill name={eventNameById[s.eventId]} />
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td>
                    {paymentMethodLabel(s) === '—' ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <span className={methodPillClass(s)}>
                        {paymentMethodLabel(s)}
                      </span>
                    )}
                  </td>
                  <td className="tabular-nums text-slate-700">
                    {s.amountCentavos != null ? (
                      <>
                        ₱{(totalPaidCentavos(s)! / 100).toLocaleString()}
                        {s.bumped && (
                          <span className="ml-1 text-[10px] text-cyan-600">
                            +OTO
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td>
                    <StatusPill status={s.status} />
                  </td>
                  <td className="text-slate-500">{formatRelative(s.createdAt)}</td>
                  <td className="text-slate-400">→</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-500">
                    No signups match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating progress toast for the non-blocking bulk send.
          Sits bottom-right so it doesn't cover the table content the
          user is still trying to interact with. */}
      {bulkSendProgress && (
        <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">
                {bulkSendProgress.status === 'sending'
                  ? `Sending ${bulkSendProgress.channel}…`
                  : 'Done.'}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                Template: {bulkSendProgress.templateId}
              </div>
            </div>
            {bulkSendProgress.status === 'done' && (
              <button
                type="button"
                onClick={() => setBulkSendProgress(null)}
                aria-label="Dismiss"
                className="text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            )}
          </div>

          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>
                {bulkSendProgress.done} / {bulkSendProgress.total}
              </span>
              <span>
                {Math.round(
                  (bulkSendProgress.done / bulkSendProgress.total) * 100,
                )}
                %
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${
                  bulkSendProgress.status === 'done'
                    ? 'bg-emerald-500'
                    : 'bg-cyan-500'
                }`}
                style={{
                  width: `${(bulkSendProgress.done / bulkSendProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-md bg-emerald-50 px-2 py-1">
              <div className="font-semibold text-emerald-700">
                {bulkSendProgress.sent}
              </div>
              <div className="text-emerald-600">Sent</div>
            </div>
            <div className="rounded-md bg-red-50 px-2 py-1">
              <div className="font-semibold text-red-700">
                {bulkSendProgress.failed}
              </div>
              <div className="text-red-600">Failed</div>
            </div>
            <div className="rounded-md bg-slate-100 px-2 py-1">
              <div className="font-semibold text-slate-700">
                {bulkSendProgress.noPhone}
              </div>
              <div className="text-slate-500">No phone</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * StatusPill — renders the FUNNEL-meaningful status label, not the raw
 * SignupStatus enum value. "registered" → "Abandoned" because in practice
 * a paid-funnel signup stuck on 'registered' means they started checkout
 * but never paid. "paid"/"attended" → "Paid". Etc.
 */
function StatusPill({ status }: { status: Signup['status'] }) {
  const display: Record<Signup['status'], { label: string; cls: string }> = {
    registered: { label: 'Abandoned', cls: 'pill pill-amber' },
    paid: { label: 'Paid', cls: 'pill pill-green' },
    attended: { label: 'Attended', cls: 'pill pill-green' },
    'no-show': { label: 'No-show', cls: 'pill pill-amber' },
    refunded: { label: 'Refunded', cls: 'pill pill-red' },
    unsubscribed: { label: 'Unsubscribed', cls: 'pill pill-red' },
  };
  const v = display[status] || { label: status, cls: 'pill' };
  return <span className={v.cls}>{v.label}</span>;
}

function formatRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
