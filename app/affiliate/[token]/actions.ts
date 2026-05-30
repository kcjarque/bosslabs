'use server';

import { revalidatePath } from 'next/cache';
import { updateAffiliateContact } from '@/lib/affiliates';

/** Affiliate self-service — update notification contact. Auth = the secret
 *  dashboard token (only the affiliate has it). */
export async function updateAffiliateContactAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  if (!token) return;
  await updateAffiliateContact(token, {
    email: String(formData.get('email') ?? '').trim(),
    telegramChatId: String(formData.get('telegramChatId') ?? '').trim(),
    notifyEmail: formData.get('notifyEmail') === 'on',
    notifyTelegram: formData.get('notifyTelegram') === 'on',
  });
  revalidatePath(`/affiliate/${token}`);
}
