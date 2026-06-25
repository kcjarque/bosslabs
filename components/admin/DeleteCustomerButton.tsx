'use client';

import { useState, useTransition } from 'react';
import { deleteCustomerAction } from '@/app/admin/customers/actions';

/**
 * Admin-only delete button for a single customer profile. Two-step confirm:
 *   1. Click "Delete customer" → shows the danger panel
 *   2. Type the customer's email + click "Delete forever" → fires the action
 * The action redirects to /admin/customers on success.
 */
export function DeleteCustomerButton({
  signupId,
  customerEmail,
  customerName,
}: {
  signupId: string;
  customerEmail: string;
  customerName: string;
}) {
  const [armed, setArmed] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const matches = confirmText.trim().toLowerCase() === customerEmail.toLowerCase();

  function fire() {
    if (!matches) return;
    setError(null);
    start(async () => {
      try {
        await deleteCustomerAction(signupId);
        // If the action returns (didn't redirect), nothing else to do here.
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Delete failed.');
      }
    });
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 px-3 py-1.5 text-[12px] font-medium text-rose-700 transition hover:border-rose-500 hover:bg-rose-50"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Delete customer
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-300 bg-rose-50/60 p-4 shadow-sm">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-rose-700">
        Delete forever — admin only
      </div>
      <p className="mt-1.5 text-[13.5px] leading-snug text-rose-900">
        This deletes <strong>{customerName || customerEmail}</strong> and cascades sequence_sends,
        sequence_subscriptions, page_views, and CRM cards. <strong>No undo.</strong>
      </p>
      <label className="mt-3 block text-[11.5px] font-medium uppercase tracking-wider text-rose-800">
        Type the email to confirm
      </label>
      <input
        type="text"
        autoFocus
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={customerEmail}
        className="mt-1 w-full rounded-md border border-rose-300 bg-white px-3 py-2 font-mono text-[13px] text-rose-900 placeholder:text-rose-300 focus:border-rose-500 focus:outline-none"
        disabled={pending}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={fire}
          disabled={!matches || pending}
          className="rounded-full bg-rose-600 px-4 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Deleting…' : 'Delete forever'}
        </button>
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            setConfirmText('');
            setError(null);
          }}
          disabled={pending}
          className="rounded-full border border-slate-300 px-4 py-1.5 text-[12.5px] font-medium text-slate-600 hover:bg-white"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-rose-100 px-3 py-2 text-[12.5px] text-rose-900">
          {error}
        </p>
      )}
    </div>
  );
}
