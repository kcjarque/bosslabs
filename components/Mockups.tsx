/**
 * Mockup components — visual props used in different sections to break up text.
 * Each mockup has its OWN visual language so sections don't feel repetitive:
 *
 *   - TerminalMockup    → Claude Code section (code-style window)
 *   - StarterPackMockup → Ticket Includes (Notion-card stack)
 *   - AppsStack         → What is BOSSLABS AI side panel (3D-tilted app cards)
 */

import { Mark } from './Mark';
import { STUDENT_BUILDS } from '@/lib/config';

/* --------------------------------------------------------------------- */
/* 1 — TerminalMockup                                                    */
/* --------------------------------------------------------------------- */

export function TerminalMockup() {
  return (
    <div className="relative">
      {/* Soft cyan glow behind terminal */}
      <div className="absolute -inset-6 rounded-3xl bg-cyan-500/10 blur-3xl" aria-hidden />

      <div className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0A0C12] shadow-card">
        {/* macOS-style header */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-3 font-sans text-[10px] uppercase tracking-[0.22em] text-ink-300 sm:text-[11px]">
            ~/bosslabs · claude code
          </span>
        </div>

        {/* Terminal body */}
        <div className="px-5 py-5 font-mono text-[12px] leading-relaxed text-ink-100 sm:px-6 sm:py-6 sm:text-[13px]">
          <Line prompt="$" command="claude code" />
          <Line muted>
            <span className="text-cyan-400">Claude Code</span> v1.0 — your terminal-based AI engineer
          </Line>

          <div className="my-4 h-px bg-white/[0.06]" />

          <Line prompt=">" command="Build me a CRM for my agency. Track leads, deals, and tasks. Use Supabase + Next.js." />

          <div className="mt-3 space-y-1.5">
            <Task ok label="Created Lead model" />
            <Task ok label="Created Deal pipeline + stages" />
            <Task ok label="Built dashboard at /app" />
            <Task ok label="Connected to Supabase" />
            <Task pending label="Deploying to Vercel…" />
          </div>

          <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 [box-shadow:0_0_8px_2px_rgba(0,184,230,0.6)]" />
            <span className="text-[11px] text-cyan-200">Live at bosslabs-crm.vercel.app</span>
          </div>

          <div className="mt-4 inline-flex items-baseline">
            <span className="text-cyan-400">$</span>
            <span className="ml-2 inline-block h-3.5 w-2 animate-[pulseDot_1.1s_steps(1)_infinite] bg-cyan-300/90" />
          </div>
        </div>
      </div>

      {/* Tiny stat sticker — anchors realism */}
      <div className="pointer-events-none absolute -right-3 -top-3 rotate-[6deg] rounded-full border border-cyan-500/50 bg-[#06070A] px-3 py-1.5 font-sans text-[10px] uppercase tracking-[0.22em] text-cyan-300 shadow-glow-sm sm:-right-5 sm:-top-5 sm:text-[11px]">
        Built in 19 min
      </div>
    </div>
  );
}

function Line({
  prompt,
  command,
  muted,
  children,
}: {
  prompt?: string;
  command?: string;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex items-baseline gap-2 ${muted ? 'text-ink-300' : ''}`}>
      {prompt && <span className="text-cyan-400">{prompt}</span>}
      <span className={muted ? '' : 'text-white'}>{command || children}</span>
    </div>
  );
}

function Task({
  ok,
  pending,
  label,
}: {
  ok?: boolean;
  pending?: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {ok && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-none text-emerald-400">
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {pending && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400/80" />}
      <span className={ok ? 'text-ink-100' : 'text-cyan-200'}>{label}</span>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* 2 — SkillsPackMockup                                                  */
/*    Visual for the Claude Code Skills Pack lead magnet.                */
/* --------------------------------------------------------------------- */

export function StarterPackMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[28px] bg-cyan-500/8 blur-3xl" aria-hidden />

      {/* Stack of 3 Notion-style cards, fanned */}
      <div className="relative grid place-items-center">
        {/* Back card */}
        <PackCard
          tilt="rotate-[-6deg] translate-x-[-8%] translate-y-[6%] z-0"
          title="Reusable Skills"
          accent="Sales · Ops · Hiring · Content"
          rows={['lead-qualifier.skill', 'workflow-auditor.skill', 'hiring-screen.skill', 'founder-followup.skill']}
          dim
        />
        {/* Middle card */}
        <PackCard
          tilt="rotate-[3deg] translate-y-[-2%] z-10"
          title="4 Starter Repos"
          accent="Production-ready"
          rows={['/crm — leads + deals', '/hr — onboarding', '/booking — calendar', '/agent — DM intake']}
        />
        {/* Front sticker */}
        <div className="absolute bottom-[-10px] right-[-14px] z-20 rotate-[8deg]">
          <div className="rounded-2xl border border-cyan-500/50 bg-[#06070A] px-4 py-3 shadow-glow">
            <div className="flex items-center gap-2">
              <Mark size={20} />
              <div>
                <div className="font-serif text-sm text-white">Founder Audit</div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-cyan-300 sm:text-[10px]">
                  Checklist · Community access
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PackCard({
  tilt,
  title,
  accent,
  rows,
  dim,
}: {
  tilt: string;
  title: string;
  accent: string;
  rows: string[];
  dim?: boolean;
}) {
  return (
    <div
      className={`${tilt} relative w-full max-w-[280px] overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-ink-800/95 to-ink-900 p-5 shadow-card backdrop-blur-sm sm:max-w-[300px] sm:p-6 ${dim ? 'opacity-80' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-serif text-lg leading-tight text-white sm:text-xl">{title}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-cyan-400 sm:text-[11px]">
            {accent}
          </div>
        </div>
        <span className="h-2 w-2 rounded-full bg-cyan-400/70 [box-shadow:0_0_8px_2px_rgba(0,184,230,0.5)]" />
      </div>

      <ul className="mt-4 space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-2.5 text-[12px] text-ink-100 sm:text-[13px]">
            <span className="h-1 w-1 flex-none rounded-full bg-cyan-300" />
            <span className="truncate">{r}</span>
          </li>
        ))}
      </ul>

      {/* Tiny "scrollbar" detail for realism */}
      <div className="absolute right-2 top-3 h-12 w-1 rounded-full bg-white/[0.06]">
        <div className="h-4 w-1 rounded-full bg-cyan-500/40" />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* 3 — AppsStack — fanned business-app cards for the WhatIs side panel   */
/* --------------------------------------------------------------------- */

export function AppsStack() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute -inset-10 rounded-[40px] bg-cyan-500/5 blur-3xl" aria-hidden />

      {/* Old card style (image + footer), but ALIGNED — no rotation/tilt. */}
      <div className="relative space-y-5 py-4 sm:py-6">
        {STUDENT_BUILDS.map((b) => (
          <a
            key={b.name}
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-ink-800/95 to-ink-900 shadow-card transition hover:-translate-y-0.5 hover:border-cyan-500/40"
          >
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={b.img}
                alt={`${b.name} — built live with BOSSLABS AI`}
                className="aspect-[16/10] w-full object-cover object-top"
                loading="lazy"
              />
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-300 sm:text-[10px]">
                <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
                Live
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="font-serif text-lg text-white">{b.name}</div>
                <div className="truncate text-[12px] text-ink-300">{b.tag}</div>
              </div>
              <span className="flex-none rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-200 transition group-hover:bg-cyan-500/20">
                See it live ↗
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
