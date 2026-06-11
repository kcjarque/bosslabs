'use server';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import {
  saveSettings,
  getSettings,
  deleteRecording,
  deleteAllRecordings,
  deleteRecordingsBySession,
} from '@/lib/db';

export async function toggleRecordingAction(): Promise<{ enabled: boolean }> {
  requireAdmin();
  const current = await getSettings();
  const updated = await saveSettings({ recordingEnabled: !current.recordingEnabled });
  return { enabled: updated.recordingEnabled };
}

export async function deleteRecordingAction(id: string): Promise<void> {
  requireAdmin();
  await deleteRecording(id);
}

export async function deleteAllRecordingsAction(): Promise<void> {
  requireAdmin();
  await deleteAllRecordings();
}

/** Delete a whole session (all its chunks), then return to the list. Bound to
 *  a <form action> on the session replay page. */
export async function deleteSessionAction(formData: FormData): Promise<void> {
  requireAdmin();
  const sessionId = String(formData.get('sessionId') || '');
  if (sessionId) await deleteRecordingsBySession(sessionId);
  redirect('/admin/recordings');
}
