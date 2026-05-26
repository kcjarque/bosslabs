'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { saveSettings, getSettings, deleteRecording, deleteAllRecordings } from '@/lib/db';

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
