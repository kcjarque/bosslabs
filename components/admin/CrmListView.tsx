'use client';

/**
 * Shared list (table) view for the CRM boards.
 *
 * A kanban answers "what shape is my pipeline"; it's poor at "show me everyone,
 * biggest deal first". Each board keeps its own cards and drag logic and just
 * describes its columns here, so all of them get the same sorting, the same
 * stage dropdown and the same look without five copies of a table.
 *
 * Styling is deliberately bare: `.admin-shell table/th/td` in app/admin/admin.css
 * already styles plain table markup, so this inherits the house look for free.
 *
 * The stage <select> is the list-view equivalent of dragging a card — it calls
 * the board's own move handler, so both views drive the same request.
 */
import { useMemo, useState, type ReactNode } from 'react';

export type CrmListColumn<T> = {
  key: string;
  label: string;
  /** Comparable value makes the column sortable; omit for non-sortable. */
  sortValue?: (row: T) => string | number;
  /** e.g. 'text-right tnum' for money. */
  className?: string;
  render: (row: T) => ReactNode;
};

export type CrmListStage<T> = {
  options: { value: string; label: string }[];
  valueOf: (row: T) => string;
  onChange: (row: T, next: string) => void;
};

export function CrmListView<T>({
  rows,
  getId,
  columns,
  stage,
  empty = 'Nothing here yet.',
  initialSort,
}: {
  rows: T[];
  getId: (row: T) => string;
  columns: CrmListColumn<T>[];
  stage?: CrmListStage<T>;
  empty?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);

  const sorted = useMemo(() => {
    const col = sort ? columns.find((c) => c.key === sort.key) : null;
    if (!sort || !col?.sortValue) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [rows, columns, sort]);

  if (rows.length === 0) {
    return <div className="card p-8 text-center text-sm text-slate-500">{empty}</div>;
  }

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={c.className}>
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className="inline-flex items-center gap-1 uppercase tracking-[0.05em] transition hover:text-slate-900"
                    >
                      {c.label}
                      <span style={{ color: sort?.key === c.key ? '#0891b2' : '#CBD5E1' }}>
                        {sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              {stage && <th scope="col">Stage</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={getId(row)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.render(row)}
                  </td>
                ))}
                {stage && (
                  <td>
                    <select
                      value={stage.valueOf(row)}
                      onChange={(e) => stage.onChange(row, e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                    >
                      {stage.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
        {sorted.length} {sorted.length === 1 ? 'record' : 'records'}
      </div>
    </div>
  );
}
