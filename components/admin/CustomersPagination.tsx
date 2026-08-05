'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

/** Prev/Next + page-size selector for /admin/customers. Fully URL-driven so
 *  the current page survives a reload/share. */
export function CustomersPagination({
  page,
  size,
  total,
  rowsOnPage,
}: {
  page: number;
  size: number;
  total: number;
  rowsOnPage: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const totalPages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = (page - 1) * size + rowsOnPage;

  function go(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params?.toString() ?? '');
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.push(`/admin/customers?${next.toString()}`));
  }

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="text-slate-500">
        {total === 0 ? (
          <span>No customers match this filter.</span>
        ) : (
          <>
            Showing{' '}
            <strong className="text-slate-800">
              {from.toLocaleString()}–{to.toLocaleString()}
            </strong>{' '}
            of <strong className="text-slate-800">{total.toLocaleString()}</strong>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-500">
          Rows per page{' '}
          <select
            className="select ml-1"
            value={size}
            onChange={(e) => go({ size: e.target.value, page: null })}
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
          </select>
        </label>
        <button
          type="button"
          disabled={page <= 1 || isPending}
          onClick={() => go({ page: String(page - 1) })}
          className="btn btn-secondary disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="text-xs text-slate-500">
          Page <strong className="text-slate-800">{page}</strong> of{' '}
          {totalPages.toLocaleString()}
        </span>
        <button
          type="button"
          disabled={page >= totalPages || isPending}
          onClick={() => go({ page: String(page + 1) })}
          className="btn btn-secondary disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
