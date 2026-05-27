'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import {
  deleteSignups,
  getSignupById,
  subscribeManyToSequence,
} from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { getWebinarInfo } from '@/lib/webinar';

/**
 * Bulk-subscribe the given customers to a sequence. Server-side filter
 * skips anyone already covered by the sequence's list filter OR by an
 * existing manual subscription, so accidentally bulk-subscribing a list
 * that already feeds the sequence is a no-op rather than a noisy dupe.
 */
export async function bulkSubscribeAction(
  signupIds: string[],
  sequenceId: string,
): Promise<{ subscribed: number; skipped: number }> {
  requireAdmin();
  if (!sequenceId) throw new Error('sequenceId required');
  if (signupIds.length === 0) throw new Error('No customers selected');
  const result = await subscribeManyToSequence(sequenceId, signupIds);
  revalidatePath('/admin/customers');
  return result;
}

/**
 * Bulk-delete customers. Their sequence_sends + sequence_subscriptions +
 * page_views cascade via FK on delete. Email/SMS/TG history is gone.
 * Caller must confirm — there's no undo.
 */
export async function bulkDeleteAction(
  signupIds: string[],
): Promise<{ count: number }> {
  requireAdmin();
  if (signupIds.length === 0) throw new Error('No customers selected');
  const count = await deleteSignups(signupIds);
  revalidatePath('/admin/customers');
  return { count };
}

/**
 * Bulk-send a templated email or SMS to every selected customer.
 *
 * Sends are awaited sequentially — Resend's free-tier rate limit is
 * 2/sec which makes parallel sends risky on a larger selection, and
 * Vercel functions have plenty of headroom (60s default) for the
 * typical webinar audience size. SMS sends are skipped (counted as
 * 'noPhone') for any customer without a phone on file.
 *
 * Returns sent/failed/noPhone counts so the UI can show what happened.
 */
export async function bulkSendAction(
  signupIds: string[],
  channel: 'email' | 'sms',
  templateId: string,
): Promise<{ sent: number; failed: number; noPhone: number }> {
  requireAdmin();
  if (signupIds.length === 0) throw new Error('No customers selected');
  if (!templateId) throw new Error('Pick a template');

  const webinar = await getWebinarInfo();

  let sent = 0;
  let failed = 0;
  let noPhone = 0;

  for (const id of signupIds) {
    const signup = await getSignupById(id);
    if (!signup) {
      failed++;
      continue;
    }
    const vars: Record<string, string> = {
      firstName: signup.firstName,
      lastName: signup.lastName ?? '',
      email: signup.email,
      phone: signup.phone,
      webinarName: webinar.name,
      webinarDate: webinar.date,
      webinarTime: webinar.time,
      webinarTimezone: webinar.timezone,
      zoomRegisterUrl: webinar.zoomRegisterUrl,
      zoomJoinUrl: webinar.zoomJoinUrl,
      replayUrl: webinar.replayUrl,
      messengerGroupUrl: webinar.messengerGroupUrl,
    };
    if (channel === 'email') {
      const res = await sendEmail({ to: signup.email, templateId, vars });
      if (res.ok) sent++;
      else failed++;
    } else {
      if (!signup.phone) {
        noPhone++;
        continue;
      }
      const res = await sendSms({ to: signup.phone, templateId, vars });
      if (res.ok) sent++;
      else failed++;
    }
  }

  return { sent, failed, noPhone };
}
