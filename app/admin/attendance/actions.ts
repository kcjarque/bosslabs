'use server';

import { requireAdmin } from '@/lib/admin-auth';
import { importZoomAttendance } from '@/lib/attendance';

export type ImportResult =
  | { ok: boolean; matched: number; total: number; unmatched: string[]; error?: string }
  | null;

export async function importAttendanceAction(_prev: ImportResult, formData: FormData): Promise<ImportResult> {
  await requireAdmin();
  const eventId = String(formData.get('eventId') ?? '').trim();
  const csv = String(formData.get('csv') ?? '');
  if (!eventId) return { ok: false, matched: 0, total: 0, unmatched: [], error: 'Pick an event first.' };
  if (!csv.trim()) return { ok: false, matched: 0, total: 0, unmatched: [], error: 'Paste or upload the Zoom CSV.' };
  const r = await importZoomAttendance(eventId, csv);
  return { ok: true, ...r };
}
