import Link from 'next/link';

export type CrmView = 'board' | 'list';

/** Board ⇄ List switch. URL-driven (?view=) so it survives refresh and is shareable. */
export function CrmViewToggle({ board, view }: { board: string; view: CrmView }) {
  const opts: { id: CrmView; label: string; icon: string }[] = [
    { id: 'board', label: 'Board', icon: '▤' },
    { id: 'list', label: 'List', icon: '☰' },
  ];
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
      {opts.map((o) => {
        const isActive = o.id === view;
        return (
          <Link
            key={o.id}
            href={`/admin/crm?board=${board}&view=${o.id}`}
            scroll={false}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium transition ${
              isActive ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
            style={isActive ? { color: '#fff' } : undefined}
          >
            <span aria-hidden>{o.icon}</span>
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
