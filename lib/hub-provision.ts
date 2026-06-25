/**
 * Provision a BossLabs Hub account for a Vault buyer.
 *
 * Calls bosslabs-hub's POST /api/provision-account, which creates an
 * auto-confirmed + approved Supabase auth user and returns the credentials
 * exactly once. The caller MUST persist the credentials on the signup row
 * before responding to anything — they are NOT recoverable from the Hub.
 *
 * Idempotent on the Hub side: a second call for the same email returns
 * `{existed: true}` without overwriting the user's current password. The
 * caller should detect this and surface the credentials it already saved.
 *
 * Returns null when:
 *   - env vars aren't set (caller skips silently — dev/local)
 *   - the upstream Hub returns an error (logged; caller continues — the
 *     payment flow must NEVER fail because the Hub call did)
 */
export type HubProvisionResult = {
  ok: boolean;
  existed: boolean;
  email: string;
  /** Only present when `existed === false` (first-time provisioning). */
  password?: string;
  userId?: string;
};

export async function provisionHubAccount(input: {
  email: string;
  fullName?: string;
  /** When true and the user already exists upstream, rotate their password
   *  and return the new one. Used by the backfill flow. */
  forceReset?: boolean;
}): Promise<HubProvisionResult | null> {
  const base = process.env.HUB_BASE_URL;
  const token = process.env.HUB_PROVISION_TOKEN;
  if (!base || !token) {
    console.warn('[hub-provision] HUB_BASE_URL or HUB_PROVISION_TOKEN missing — skipping');
    return null;
  }
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/provision-account`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: input.email,
        fullName: input.fullName ?? '',
        ...(input.forceReset ? { forceReset: true } : {}),
      }),
      // 12s timeout — Supabase auth admin create can stall under load.
      signal: AbortSignal.timeout(12_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || json.ok !== true) {
      // Redact the body: never log password — if upstream returns an unexpected
      // shape with creds in it, we still don't want them in Vercel function logs.
      console.error('[hub-provision] upstream non-ok', {
        status: res.status,
        ok: json.ok ?? null,
        existed: json.existed ?? null,
        error: typeof json.error === 'string' ? json.error : null,
      });
      return null;
    }
    return {
      ok: true,
      existed: Boolean(json.existed),
      email: String(json.email ?? input.email),
      password: typeof json.password === 'string' ? json.password : undefined,
      userId: typeof json.userId === 'string' ? json.userId : undefined,
    };
  } catch (err) {
    console.error('[hub-provision] fetch failed', err instanceof Error ? err.message : err);
    return null;
  }
}
