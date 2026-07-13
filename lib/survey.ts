/**
 * Post-payment survey (SPEC §1.4 / §2). Stores the response and copies the
 * enum answers onto the contact (industry / pain / intent) so they become tags
 * the machine can segment on — the "insert trigger" from the spec, done in-app
 * for testability.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export const SURVEY_INDUSTRIES = ['food_retail', 'services', 'logistics_ops', 'agency_freelance', 'manufacturing', 'other'] as const;
export const SURVEY_PAINS = ['orders_tracking', 'manual_reports', 'followups', 'team_visibility', 'other'] as const;
export const SURVEY_INTENTS = ['diy', 'dfy'] as const;

export type SurveyInput = {
  contactId: string;
  q1Industry: string;
  q2Pain: string;
  q2Freetext?: string;
  q3Freetext?: string;
  q4Intent: string;
};

export async function saveSurveyResponse(input: SurveyInput): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'unavailable' };
  const q1 = (SURVEY_INDUSTRIES as readonly string[]).includes(input.q1Industry) ? input.q1Industry : 'other';
  const q2 = (SURVEY_PAINS as readonly string[]).includes(input.q2Pain) ? input.q2Pain : 'other';
  const q4 = (SURVEY_INTENTS as readonly string[]).includes(input.q4Intent) ? input.q4Intent : null;
  const sb = getSupabase();

  // Resolve the contact's event so the response is attributable per event.
  let eventId: string | null = null;
  try {
    const { data } = await sb.from('signups').select('event_id').eq('id', input.contactId).maybeSingle();
    eventId = (data as { event_id?: string | null } | null)?.event_id ?? null;
  } catch {
    /* best-effort */
  }

  const { error } = await sb.from('survey_responses').insert({
    contact_id: input.contactId,
    event_id: eventId,
    q1_industry: q1,
    q2_pain: q2,
    q2_freetext: input.q2Freetext?.slice(0, 2000) || null,
    q3_freetext: input.q3Freetext?.slice(0, 2000) || null,
    q4_intent: q4,
  });
  if (error) return { ok: false, error: error.message };

  // Copy enum answers onto the contact → segmentation tags (§1.4).
  try {
    await sb
      .from('signups')
      .update({
        industry: q1,
        pain: q2,
        intent: q4,
        pain_freetext: input.q2Freetext?.slice(0, 2000) || input.q3Freetext?.slice(0, 2000) || null,
      })
      .eq('id', input.contactId);
  } catch {
    /* the response is saved; tag copy is best-effort */
  }
  return { ok: true };
}
