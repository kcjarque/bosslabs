import Link from 'next/link';

const TABS: { href: string; label: string; key: 'overview' | 'drip' }[] = [
  { href: '/admin/machine', label: 'Overview', key: 'overview' },
  { href: '/admin/machine/drip', label: 'Drip performance', key: 'drip' },
];

/** Pill tab bar shared by The Machine's Overview + Drip performance pages. */
export function MachineTabs({ active }: { active: 'overview' | 'drip' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
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
