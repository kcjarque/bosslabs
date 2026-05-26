'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  toggleRecordingAction,
  deleteAllRecordingsAction,
} from '@/app/admin/recordings/actions';

export function RecordingsControls({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleRecordingAction();
      setEnabled(result.enabled);
    });
  }

  function handleDeleteAll() {
    if (!window.confirm('Delete ALL recordings? This cannot be undone.')) return;
    startTransition(async () => {
      await deleteAllRecordingsAction();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
          enabled ? 'bg-cyan-600' : 'bg-slate-300'
        } ${isPending ? 'opacity-60' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm ring-0 transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      <span className="text-sm font-medium text-slate-700">
        {enabled ? 'Recording ON' : 'Recording OFF'}
      </span>

      <button
        type="button"
        onClick={handleDeleteAll}
        disabled={isPending}
        className="ml-auto rounded-full bg-red-100 px-3 py-1 text-[11px] font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
      >
        Delete all
      </button>
    </div>
  );
}
