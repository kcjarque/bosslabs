import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { getSessionChunks } from '@/lib/db';
import { ReplayViewer } from '@/components/ReplayViewer';
import { deleteSessionAction } from '../../actions';

export const dynamic = 'force-dynamic';

type RrEvent = { type?: number; timestamp?: number };

function minTimestamp(events: RrEvent[], fallback: number): number {
  let min = Infinity;
  for (const e of events) {
    if (typeof e.timestamp === 'number' && e.timestamp < min) min = e.timestamp;
  }
  return min === Infinity ? fallback : min;
}

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function fmtBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Full-session replay — stitches every chunk recorded under one session_id
 * into a single continuous rrweb stream. Each page load is its own capture
 * chunk (fresh JS context), so we merge here at replay time: all events
 * flattened and sorted by their own wall-clock timestamp. rrweb-player rebuilds
 * the DOM at each page's snapshot, so the visit plays start-to-finish across
 * pages — the "consolidated, not per page" view.
 */
export default async function SessionReplayPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  requireAdmin();
  const { sessionId: raw } = await params;
  const sessionId = decodeURIComponent(raw);

  const chunks = await getSessionChunks(sessionId);
  if (chunks.length === 0) notFound();

  // Merge all chunk events into one continuous stream, ordered by the events'
  // own timestamps (robust to out-of-order flush times).
  const merged = chunks
    .flatMap((c) => (Array.isArray(c.events) ? (c.events as RrEvent[]) : []))
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  // Page journey: order chunks by first event time, collapse consecutive
  // repeats of the same page → the real navigation path.
  const ordered = chunks
    .map((c) => {
      const evs = Array.isArray(c.events) ? (c.events as RrEvent[]) : [];
      return { page: c.page, at: minTimestamp(evs, new Date(c.createdAt).getTime()) };
    })
    .sort((a, b) => a.at - b.at);

  const journey: { page: string; at: number }[] = [];
  for (const c of ordered) {
    if (journey.length === 0 || journey[journey.length - 1].page !== c.page) {
      journey.push({ page: c.page, at: c.at });
    }
  }

  const totalBytes = chunks.reduce((s, c) => s + (c.sizeBytes ?? 0), 0);
  const firstAt = merged.length ? merged[0].timestamp ?? 0 : 0;
  const lastAt = merged.length ? merged[merged.length - 1].timestamp ?? 0 : 0;
  const durationMs = lastAt - firstAt;

  return (
    <div className="space-y-5">
      <Link href="/admin/recordings" className="text-sm text-cyan-700 hover:underline">
        ← Back to sessions
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-700">
            Full session replay
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            {journey.map((j) => j.page).join('  →  ') || 'Session'}
          </h1>
          <p className="mt-1 text-[12px] text-slate-500">
            {firstAt ? new Date(firstAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '—'} · {fmtDuration(durationMs)} ·{' '}
            {merged.length} events · {chunks.length} chunk{chunks.length === 1 ? '' : 's'} ·{' '}
            {fmtBytes(totalBytes)} · <span className="font-mono">{sessionId}</span>
          </p>
        </div>
        <form action={deleteSessionAction}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <button
            type="submit"
            className="rounded-full bg-red-100 px-3 py-1.5 text-[11px] font-medium text-red-700 hover:bg-red-200"
          >
            Delete session
          </button>
        </form>
      </header>

      {/* Page-journey timeline */}
      {journey.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {journey.map((j, i) => (
            <span key={`${j.page}-${i}`} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-300">→</span>}
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                {j.page || '/'}{' '}
                <span className="text-slate-400">
                  {firstAt ? `+${fmtDuration(j.at - firstAt)}` : ''}
                </span>
              </span>
            </span>
          ))}
        </div>
      )}

      <ReplayViewer events={merged} />

      <p className="text-[11px] text-slate-400">
        Plays the whole visit across pages. Each page load appears as a brief jump (the real
        navigation) where the player rebuilds the new page. Input values are masked.
      </p>
    </div>
  );
}
