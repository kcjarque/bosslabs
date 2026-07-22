'use client';

import { useRef } from 'react';
import { deleteMyReimbursementAction } from '@/app/admin/reimbursements/actions';

/** Cancel a still-pending claim you submitted by mistake — before an admin
 *  pays it out. Not available once paid. */
export function DeleteReimbursementButton({ requestId }: { requestId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      action={deleteMyReimbursementAction}
      onSubmit={(e) => {
        if (!window.confirm('Cancel this claim?')) e.preventDefault();
      }}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        className="shrink-0 text-[11px] font-medium text-rose-600 hover:underline"
        title="Cancel this claim"
      >
        Cancel
      </button>
    </form>
  );
}
