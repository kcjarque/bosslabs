/**
 * /admin/debug-sms — one-shot probe against every plausible OneWaySMS
 * endpoint, running from the Vercel runtime so we're testing from the
 * exact network path the real /api/admin/test-send call uses.
 *
 * Sends well-formed but intentionally-invalid credentials (apiusername=
 * PROBE) so a healthy gateway returns -100 (auth failed) — that's our
 * "this endpoint is alive and speaks the API" signal. Anything else
 * (timeout, ECONNRESET, 404, empty body) tells us why a given endpoint
 * is unusable.
 *
 * Self-contained. No real SMS gets sent. Safe to leave deployed.
 */

import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CANDIDATES = [
  'https://gateway.onewaysms.com.ph:10443/api.aspx',
  'https://gateway.onewaysms.com.ph/api.aspx',
  'https://gateway.onewaysms.com.ph/api2.aspx',
  'http://gateway.onewaysms.com.ph/api.aspx',
  'http://gateway80.onewaysms.ph/api2.aspx',
  'http://gateway80.onewaysms.ph/api.aspx',
  'https://gateway2.onewaysms.com.ph:10443/api.aspx',
  'https://gateway2.onewaysms.com.ph/api2.aspx',
];

type ProbeResult = {
  endpoint: string;
  ok: boolean;
  status?: number;
  statusText?: string;
  bodySnippet?: string;
  bodyEmpty?: boolean;
  latencyMs: number;
  error?: string;
  errorCode?: string;
  verdict: string;
};

async function probeOne(endpoint: string): Promise<ProbeResult> {
  const start = Date.now();
  try {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      return {
        endpoint,
        ok: false,
        latencyMs: 0,
        error: 'invalid URL',
        verdict: '✗ invalid URL format',
      };
    }
    // Well-formed query that a real gateway will recognize but reject.
    url.searchParams.set('apiusername', 'PROBE');
    url.searchParams.set('apipassword', 'PROBE');
    url.searchParams.set('senderid', 'PROBE');
    url.searchParams.set('mobileno', '639999999999');
    url.searchParams.set('message', 'ping');

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });
    const text = (await res.text()).trim();
    const latencyMs = Date.now() - start;
    const bodySnippet = text.slice(0, 150);
    const num = Number(text);

    let verdict = '';
    if (!res.ok) {
      verdict = `✗ HTTP ${res.status} ${res.statusText}`;
    } else if (!text) {
      verdict = '✗ empty body (wrong path or IP-blocked)';
    } else if (Number.isNaN(num)) {
      verdict = `✗ non-numeric response`;
    } else if (num === -100) {
      verdict = '✓ alive — got -100 (auth fail expected, endpoint works)';
    } else if (num <= 0) {
      verdict = `△ got code ${num} (alive but unexpected)`;
    } else {
      // Should never happen with PROBE creds, but if so: an actual SMS got sent.
      verdict = `?! got ${num} — unexpected success ID`;
    }

    return {
      endpoint,
      ok: !res.ok ? false : !!text && !Number.isNaN(num) && num === -100,
      status: res.status,
      statusText: res.statusText,
      bodySnippet,
      bodyEmpty: !text,
      latencyMs,
      verdict,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const cause = err instanceof Error
      ? (err as Error & { cause?: { code?: string; message?: string } }).cause
      : undefined;
    const code = cause?.code ?? '';
    const message = cause?.message ?? (err instanceof Error ? err.message : 'unknown');
    let verdict: string;
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      verdict = '✗ TIMEOUT (10s) — host unreachable or port blocked';
    } else if (code === 'ENOTFOUND') {
      verdict = '✗ DNS does not resolve';
    } else if (code === 'ECONNREFUSED') {
      verdict = '✗ connection refused — port not listening';
    } else if (code === 'ECONNRESET') {
      verdict = '✗ ECONNRESET during TLS handshake — port/cert broken';
    } else if (code === 'EPROTO' || code.startsWith('CERT_') || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      verdict = '✗ TLS protocol/cert error';
    } else {
      verdict = `✗ ${code || 'error'}: ${message.slice(0, 100)}`;
    }
    return { endpoint, ok: false, latencyMs, error: message, errorCode: code, verdict };
  }
}

export default async function DebugSmsPage() {
  requireAdmin();

  const results = await Promise.all(CANDIDATES.map(probeOne));
  const winners = results.filter((r) => r.ok);
  const sorted = [...results].sort((a, b) => Number(b.ok) - Number(a.ok) || a.latencyMs - b.latencyMs);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          OneWaySMS endpoint probe
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Tested {CANDIDATES.length} candidate endpoints from this Vercel
          deployment. Probe uses fake credentials — a healthy endpoint
          returns <code>-100</code> (auth failed) which means &ldquo;the
          server is alive and speaks the API.&rdquo; No real SMS gets sent.
        </p>
      </header>

      {winners.length > 0 ? (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-700">
            Working endpoint{winners.length > 1 ? 's' : ''} found
          </div>
          <ol className="mt-2 space-y-1">
            {winners.map((w) => (
              <li key={w.endpoint} className="font-mono text-[13px] text-emerald-900">
                {w.endpoint}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-emerald-800">
            Paste one into <code>/admin/settings</code> → SMS · API endpoint,
            save, and the test send should now succeed with{' '}
            <code>-100 (authentication failed)</code> — that means it&rsquo;s
            ready for real credentials. Then enter your actual API password,
            save again, retest.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-red-700">
            No endpoint is reachable from this Vercel deployment
          </div>
          <p className="mt-2 text-sm text-red-800">
            Every candidate failed. Most likely causes:
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-red-800">
            <li>OneWaySMS requires IP allowlisting — your Vercel egress IPs aren&rsquo;t on the list</li>
            <li>OneWaySMS service outage</li>
            <li>Your account is on a custom gateway not in this candidate list</li>
          </ul>
          <p className="mt-2 text-sm text-red-800">
            Email OneWaySMS support with the table below + ask for your
            exact endpoint URL. Or set up a fixed-IP proxy (Fixie / QuotaGuard).
          </p>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="min-w-full text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="py-2 pr-3">Endpoint</th>
              <th className="py-2 pr-3">HTTP</th>
              <th className="py-2 pr-3">Body</th>
              <th className="py-2 pr-3">Latency</th>
              <th className="py-2">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.endpoint} className="border-b border-slate-100 last:border-b-0">
                <td className="py-2 pr-3 font-mono text-[12px]">{r.endpoint}</td>
                <td className="py-2 pr-3 text-slate-700">
                  {r.status ? `${r.status} ${r.statusText ?? ''}` : '—'}
                </td>
                <td className="py-2 pr-3 font-mono text-[11px] text-slate-600">
                  {r.bodyEmpty ? '(empty)' : r.bodySnippet ? `"${r.bodySnippet}"` : '—'}
                </td>
                <td className="py-2 pr-3 text-slate-500 tabular-nums">{r.latencyMs}ms</td>
                <td className={`py-2 ${r.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                  {r.verdict}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Tip: refresh this page to re-probe (results aren&rsquo;t cached).
        Once you&rsquo;ve found a working endpoint, you can leave this page
        in place or delete <code>app/admin/debug-sms/</code> — it&rsquo;s
        admin-gated either way.
      </p>
    </div>
  );
}
