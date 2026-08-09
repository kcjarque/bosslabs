/**
 * Post-payment survey (SPEC §1.4 / §2), v2 — English, 6 questions. Stores the
 * response and copies the enum answers (industry / pain / intent) onto the
 * contact so they become segmentation tags for the machine (the "insert
 * trigger" from the spec, done in-app for testability). team_size + tried_before
 * are stored on the response for analytics but NOT copied to the contact (no
 * segment filter keys off them yet).
 *
 * Column-name history: `q3_freetext` now holds Q5 ("first process to automate")
 * and `q4_intent` now holds Q6 (build intent) — names kept stable so old rows
 * and the admin/CSV readers don't churn.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export const SURVEY_INDUSTRIES = [
  'food_retail', 'services', 'construction', 'healthcare', 'education',
  'professional_services', 'real_estate', 'logistics_ops', 'agency_freelance',
  'manufacturing', 'other',
] as const;
export const SURVEY_PAINS = [
  'orders_tracking', 'manual_reports', 'inventory', 'payments_collections',
  'followups', 'team_visibility', 'other',
] as const;
export const SURVEY_TEAM_SIZES = ['solo', 'micro', 'small', 'mid'] as const;
export const SURVEY_TRIED = ['never', 'abandoned', 'manual_system', 'has_software'] as const;
export const SURVEY_INTENTS = ['diy', 'diy_open', 'dfy'] as const;

export type SurveyInput = {
  contactId: string;
  q1Industry: string;
  q1Freetext?: string;
  q2Pain: string;
  q2Freetext?: string;
  teamSize: string;
  triedBefore: string;
  /** Q5 free text — "first process you'd want to automate". Stored in q3_freetext. */
  firstProcess?: string;
  /** Q6 build intent. Stored in q4_intent. */
  intent: string;
};

const inEnum = (v: string, allowed: readonly string[], fallback: string | null) =>
  allowed.includes(v) ? v : fallback;

export async function saveSurveyResponse(input: SurveyInput): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'unavailable' };
  const q1 = inEnum(input.q1Industry, SURVEY_INDUSTRIES, 'other') as string;
  const q2 = inEnum(input.q2Pain, SURVEY_PAINS, 'other') as string;
  const teamSize = inEnum(input.teamSize, SURVEY_TEAM_SIZES, null);
  const triedBefore = inEnum(input.triedBefore, SURVEY_TRIED, null);
  const intent = inEnum(input.intent, SURVEY_INTENTS, null);
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
    q1_freetext: input.q1Freetext?.slice(0, 2000) || null,
    q2_pain: q2,
    q2_freetext: input.q2Freetext?.slice(0, 2000) || null,
    team_size: teamSize,
    tried_before: triedBefore,
    q3_freetext: input.firstProcess?.slice(0, 4000) || null, // Q5
    q4_intent: intent, // Q6
  });
  if (error) return { ok: false, error: error.message };

  // Copy enum answers onto the contact → segmentation tags (§1.4). team_size /
  // tried_before are analytics-only for now, so not mirrored here.
  try {
    await sb
      .from('signups')
      .update({
        industry: q1,
        pain: q2,
        intent,
        pain_freetext:
          input.q2Freetext?.slice(0, 2000) || input.firstProcess?.slice(0, 2000) || input.q1Freetext?.slice(0, 2000) || null,
      })
      .eq('id', input.contactId);
  } catch {
    /* the response is saved; tag copy is best-effort */
  }
  return { ok: true };
}
