/**
 * Referral-cookie constants. Kept dependency-free so edge middleware can
 * import them without pulling in the Supabase client.
 */
export const REF_COOKIE = 'bl_ref';
export const REF_TOUCH_COOKIE = 'bl_ref_t';
export const REF_MAX_AGE_SECONDS = 15 * 24 * 60 * 60; // 15 days, first-touch
