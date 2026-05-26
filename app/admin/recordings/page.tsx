import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { getSettings, getRecordings, getRecordingsStorageBytes } from '@/lib/db';
import { RecordingsControls } from '@/components/RecordingsControls';

export const dynamic = 'force-dynamic';

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function RecordingsPage() {
  requireAdmin();
  const [settings, recordings, totalBytes] = await Promise.all([
    getSettings(),
    getRecordings(),
    getRecordingsStorageBytes(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Session recordings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          rrweb screen recordings of visitor sessions on /checkout, /oto, and the homepage.
          Toggle recording on/off and manage storage here.
        </p>
      </header>

      <RecordingsControls initialEnabled={settings.recordingEnabled} />

      <div className="flex items-center gap-4 text-sm text-slate-600">
        <span>
          <strong>{recordings.length}</strong> recording{recordings.length === 1 ? '' : 's'}
        </span>
        <span>
          <strong>{fmtBytes(totalBytes)}</strong> total storage
        </span>
      </div>

      {recordings.length === 0 ? (
        <div className="card text-center text-sm text-slate-500">
          No recordings yet. Turn recording on above and visit your site to capture sessions.
        </div>
      ) : (
        <div className="space-y-2">
          {recordings.map((r) => (
            <div key={r.id} className="card flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                    {r.page}
                  </span>
                  <span className="text-[11px] text-slate-500">{timeAgo(r.createdAt)}</span>
                  <span className="text-[10px] text-slate-400">{fmtBytes(r.sizeBytes)}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-400 font-mono">
                  {r.sessionId}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/recordings/${r.id}`}
                  className="rounded-full bg-cyan-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-cyan-700"
                >
                  Replay
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
