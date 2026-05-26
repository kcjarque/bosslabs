'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteRecordingAction } from '@/app/admin/recordings/actions';

export function DeleteRecordingButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const [deleted, setDeleted] = useState(false);
  const router = useRouter();

  function handleDelete() {
    if (!window.confirm('Delete this recording?')) return;
    startTransition(async () => {
      await deleteRecordingAction(id);
      setDeleted(true);
      router.push('/admin/recordings');
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending || deleted}
      className="rounded-full bg-red-100 px-3 py-1 text-[11px] font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
    >
      {isPending ? 'Deleting…' : 'Delete recording'}
    </button>
  );
}
