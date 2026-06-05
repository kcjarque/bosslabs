'use server';

import { updateRetreatReservation } from '@/lib/db';

export type PrepInput = {
  overnight?: boolean;
  diet?: string;
  buildIdea?: string;
  business?: string;
};

/** Save the "rest" of the reservation, collected after payment on the done page. */
export async function savePrepDetailsAction(
  id: string,
  input: PrepInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'Missing reservation id.' };
  try {
    await updateRetreatReservation(id, {
      overnight: input.overnight,
      diet: input.diet?.trim() || undefined,
      buildIdea: input.buildIdea?.trim() || undefined,
      business: input.business?.trim() || undefined,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save.' };
  }
}
