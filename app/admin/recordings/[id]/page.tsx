import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import { getRecording } from '@/lib/db';
import { ReplayViewer } from '@/components/ReplayViewer';
import { DeleteRecordingButton } from '@/components/DeleteRecordingButton';

export const dynamic = 'force-dynamic';

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  requireAdmin();
  const { id } = await params;
  const recording = await getRecording(id);
  if (!recording) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/recordings"
            className="text-[12px] text-cyan-600 underline-offset-4 hover:underline"
          >
            &larr; Back to recordings
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            Session replay
          </h1>
          <p className="text-[12px] text-slate-500">
            {recording.page} &middot; {new Date(recording.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} &middot;{' '}
            {recording.events.length} events
          </p>
        </div>
        <DeleteRecordingButton id={recording.id} />
      </div>
      <ReplayViewer events={recording.events} />
    </div>
  );
}
