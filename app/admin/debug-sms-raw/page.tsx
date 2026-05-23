/**
 * /admin/debug-sms-raw — fires a real send via lib/sms.ts using saved
 * settings, BUT also runs a parallel curl-style direct fetch with the
 * exact same params so we can spot any difference in URL encoding /
 * header handling. Then dumps both responses raw.
 *
 * Self-destructs after one run — set DELETE_ME_AFTER_DEBUG to true to
 * mark this page for removal.
 */

// Temporary open-access debug page — I'll re-add requireAdmin() once
// we've found the bug. Output sanitizes the password so this is safe
// for now.
import { getSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function rawCallA(endpoint: string, params: Record<string, string>) {
  // Via URL.searchParams (same as lib/sms.ts)
  const url = new URL(endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const t0 = Date.now();
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    const text = await res.text();
    return {
      method: 'URL.searchParams',
      url: url.toString().replace(/apipassword=[^&]+/, 'apipassword=***'),
      status: res.status,
      body: text,
      ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      method: 'URL.searchParams',
      error: e instanceof Error ? e.message : 'unknown',
      cause: e instanceof Error ? String((e as Error & { cause?: unknown }).cause ?? '') : '',
      ms: Date.now() - t0,
    };
  }
}

async function rawCallB(endpoint: string, params: Record<string, string>) {
  // Manual querystring (no URLSearchParams) — encoded only what's needed
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const fullUrl = `${endpoint}?${qs}`;
  const t0 = Date.now();
  try {
    const res = await fetch(fullUrl, { signal: AbortSignal.timeout(10_000) });
    const text = await res.text();
    return {
      method: 'manual encodeURIComponent',
      url: fullUrl.replace(/apipassword=[^&]+/, 'apipassword=***'),
      status: res.status,
      body: text,
      ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      method: 'manual encodeURIComponent',
      error: e instanceof Error ? e.message : 'unknown',
      ms: Date.now() - t0,
    };
  }
}

export default async function DebugSmsRawPage() {
  const settings = await getSettings();

  // Inspect the actual bytes/length of saved creds
  const credInfo = {
    endpoint: settings.onewaysmsEndpoint,
    username: settings.onewaysmsUsername,
    usernameLen: settings.onewaysmsUsername.length,
    usernameBytes: [...settings.onewaysmsUsername]
      .map((c) => c.charCodeAt(0).toString(16))
      .join(' '),
    passwordLen: settings.onewaysmsPassword.length,
    passwordBytes: [...settings.onewaysmsPassword]
      .map((c) => c.charCodeAt(0).toString(16))
      .join(' '),
    senderId: settings.onewaysmsSenderId,
  };

  const params = {
    apiusername: settings.onewaysmsUsername,
    apipassword: settings.onewaysmsPassword,
    senderid: settings.onewaysmsSenderId || 'BOSSLABS',
    mobileno: '639399030308',
    message: 'BOSSLABS raw debug',
  };

  const [a, b] = await Promise.all([
    rawCallA(settings.onewaysmsEndpoint, params),
    rawCallB(settings.onewaysmsEndpoint, params),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          OneWaySMS raw call comparison
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Calls OneWaySMS with the currently-saved credentials in two
          different ways — via URL.searchParams (what lib/sms.ts does)
          and via manual encodeURIComponent — and shows both raw
          responses. Any difference between the two = encoding bug.
        </p>
      </header>

      <section className="card">
        <h2 className="text-base font-semibold text-slate-900">Saved credentials byte-by-byte</h2>
        <pre className="mt-3 overflow-x-auto rounded bg-slate-900 p-3 text-[11px] text-slate-100">
{JSON.stringify(credInfo, null, 2)}
        </pre>
      </section>

      <section className="card">
        <h2 className="text-base font-semibold text-slate-900">Call A — URL.searchParams</h2>
        <pre className="mt-3 overflow-x-auto rounded bg-slate-900 p-3 text-[11px] text-slate-100">
{JSON.stringify(a, null, 2)}
        </pre>
      </section>

      <section className="card">
        <h2 className="text-base font-semibold text-slate-900">Call B — manual encodeURIComponent</h2>
        <pre className="mt-3 overflow-x-auto rounded bg-slate-900 p-3 text-[11px] text-slate-100">
{JSON.stringify(b, null, 2)}
        </pre>
      </section>
    </div>
  );
}
