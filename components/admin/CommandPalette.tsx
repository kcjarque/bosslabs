'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavIcon } from './NavIcon';

export type PaletteItem = { href: string; label: string; icon: string; group: string };

/**
 * ⌘K command palette — jump to any admin page. Opens on ⌘K / Ctrl+K, or when
 * anything dispatches the 'open-command-palette' window event (the sidebar +
 * mobile search buttons do). Pure client-side navigation — zero backend, and a
 * much faster way to move around than hunting the sidebar. Mobile: tappable
 * rows, full-width sheet, works with no keyboard.
 */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      // Defer focus so the input is mounted.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (it) => it.label.toLowerCase().includes(needle) || it.group.toLowerCase().includes(needle),
    );
  }, [q, items]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[active];
      if (item) go(item.href);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh] sm:pt-[16vh]"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-3">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Search or jump to a page…"
            className="flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
          />
          <span className="hidden rounded-md border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 sm:inline">
            esc
          </span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-slate-400">No matches</div>
          ) : (
            results.map((it, i) => (
              <button
                key={it.href}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(it.href)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] transition ${
                  i === active ? 'bg-cyan-50 text-cyan-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <NavIcon name={it.icon} className={i === active ? 'text-cyan-600' : 'text-slate-400'} />
                <span className="flex-1">{it.label}</span>
                <span className="text-[11px] text-slate-400">{it.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
