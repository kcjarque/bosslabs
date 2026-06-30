'use client';

import Link from 'next/link';

const TABS = [
  { id: 'vision', label: 'Customer & Vision' },
  { id: 'files', label: 'Files' },
  { id: 'devops', label: 'DevOps' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function DfyTabSwitcher({ activeTab, projectId }: { activeTab: TabId; projectId: string }) {
  return (
    <div className="-mx-4 border-b border-slate-200 bg-white px-4 sm:-mx-6 sm:px-6">
      <nav className="flex gap-1 text-[13px]">
        {TABS.map((t) => {
          const isActive = t.id === activeTab;
          return (
            <Link
              key={t.id}
              href={`/admin/dfy/${projectId}?tab=${t.id}`}
              scroll={false}
              className={`rounded-t-md border-b-2 px-3 py-2.5 transition ${
                isActive
                  ? 'border-cyan-600 font-semibold text-cyan-700'
                  : 'border-transparent font-medium text-slate-500 hover:text-slate-900'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
