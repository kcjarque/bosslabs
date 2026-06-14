import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import {
  getSettings,
  getRecordings,
  getRecordingsStorageBytes,
  getCustomersBySession,
} from '@/lib/db';
import { RecordingsControls } from '@/components/RecordingsControls';
import {
  FUNNEL_TABS,
  isFunnelTab,
  sessionMatchesTab,
  type FunnelTab,
} from '@/lib/recordings-funnel';

export const dynamic = 'force-dynamic';

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type SessionRow = {
  sessionId: string;
  pages: string[]; // navigation order, de-duped
  chunkCount: number;
  totalBytes: number;
  lastAt: number;
};

export default async function RecordingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  requireAdmin();
  const sp = await searchParams;
  const tab: FunnelTab = isFunnelTab(sp.tab) ? sp.tab : 'all';

  const [settings, recordings, totalBytes, customers] = await Promise.all([
    getSettings(),
    getRecordings(),
    getRecordingsStorageBytes(),
    getCustomersBySession(),
  ]);

  // Group chunks → one row per visitor session (a visit spans many pages +
  // 30s flush chunks). This is the "consolidated, not per page" view.
  const map = new Map<string, SessionRow & { _seen: Set<string> }>();
  for (const r of recordings) {
    const e =
      map.get(r.sessionId) ??
      { sessionId: r.sessionId, pages: [], chunkCount: 0, totalBytes: 0, lastAt: 0, _seen: new Set<string>() };
    e.chunkCount += 1;
    e.totalBytes += r.sizeBytes ?? 0;
    const t = new Date(r.createdAt).getTime();
    if (t > e.lastAt) e.lastAt = t;
    const pg = r.page || '/';
    if (!e._seen.has(pg)) {
      e._seen.add(pg);
      e.pages.push(pg);
    }
    map.set(r.sessionId, e);
  }
  const allSessions: SessionRow[] = [...map.values()]
    .map(({ _seen, ...s }) => s)
    .sort((a, b) => b.lastAt - a.lastAt);

  // Per-tab counts (computed once, drives the tab badges).
  const counts: Record<FunnelTab, number> = { all: 0, main: 0, abandoned: 0, orderbump: 0 };
  for (const s of allSessions) {
    for (const t of FUNNEL_TABS) {
      if (sessionMatchesTab(s.pages, t.key)) counts[t.key] += 1;
    }
  }

  const sessions = allSessions.filter((s) => sessionMatchesTab(s.pages, tab));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Session recordings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Self-hosted rrweb replays of visitor sessions on the homepage, /checkout, and /oto.
          Each row is one whole visit — pages stitched into a single replay. Input values are
          masked; only behaviour (clicks, scroll, movement) is captured.
        </p>
      </header>

      <RecordingsControls initialEnabled={settings.recordingEnabled} />

      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <span>
          <strong>{allSessions.length}</strong> session{allSessions.length === 1 ? '' : 's'}
        </span>
        <span>
          <strong>{recordings.length}</strong> chunks
        </span>
        <span>
          <strong>{fmtBytes(totalBytes)}</strong> total storage
        </span>
        <Link
          href={`/admin/recordings/heatmap?tab=${tab === 'all' ? 'main' : tab}`}
          className="ml-auto rounded-full bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-slate-700"
        >
          View heatmap →
        </Link>
      </div>

      {/* Funnel tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {FUNNEL_TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/admin/recordings?tab=${t.key}`}
              title={t.hint}
              className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'border-cyan-600 text-cyan-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                  active ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {counts[t.key]}
              </span>
            </Link>
          );
        })}
      </div>

      {sessions.length === 0 ? (
        <div className="card text-center text-sm text-slate-500">
          {settings.recordingEnabled
            ? 'No sessions in this tab yet. Visit the funnel to capture one.'
            : 'Recording is OFF. Turn it on above to start capturing sessions.'}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const cust = customers.get(s.sessionId);
            return (
            <div key={s.sessionId} className="card flex items-center justify-between gap-4">
              <div className="min-w-0">
                {cust ? (
                  <Link
                    href={`/admin/customers/${cust.signupId}`}
                    className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5"
                  >
                    <span className="text-sm font-semibold text-slate-900 hover:underline">
                      {cust.name}
                    </span>
                    <span className="text-[12px] text-slate-500">{cust.email}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        cust.status === 'paid' || cust.status === 'attended'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {cust.status}
                    </span>
                  </Link>
                ) : (
                  <div className="mb-1 text-[12px] text-slate-400">Anonymous visitor</div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  {s.pages.slice(0, 5).map((p, i) => (
                    <span key={`${p}-${i}`} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-slate-300">→</span>}
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {p}
                      </span>
                    </span>
                  ))}
                  {s.pages.length > 5 && (
                    <span className="text-[11px] text-slate-400">+{s.pages.length - 5}</span>
                  )}
                </div>
                <p className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                  <span>{timeAgo(s.lastAt)}</span>
                  <span>·</span>
                  <span>{s.chunkCount} chunk{s.chunkCount === 1 ? '' : 's'}</span>
                  <span>·</span>
                  <span>{fmtBytes(s.totalBytes)}</span>
                  <span>·</span>
                  <span className="truncate font-mono">{s.sessionId}</span>
                </p>
              </div>
              <Link
                href={`/admin/recordings/session/${encodeURIComponent(s.sessionId)}`}
                className="shrink-0 rounded-full bg-cyan-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-cyan-700"
              >
                Replay visit
              </Link>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
