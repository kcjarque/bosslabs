import Link from 'next/link';

const TABS: { href: string; label: string; key: 'overview' | 'drip' | 'survey' }[] = [
  { href: '/admin/machine', label: 'Overview', key: 'overview' },
  { href: '/admin/machine/drip', label: 'Drip performance', key: 'drip' },
  { href: '/admin/machine/survey', label: 'Survey', key: 'survey' },
];

/** Pill tab bar shared by The Machine's Overview + Drip performance + Survey pages. */
export function MachineTabs({ active }: { active: 'overview' | 'drip' | 'survey' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          // inline white wins over admin.css `.admin-shell a { color: inherit }`.
          style={t.key === active ? { color: '#fff' } : undefined}
          className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
            t.key === active
              ? 'bg-slate-900 text-white'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
