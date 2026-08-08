/**
 * Backfill ad creative-context for the Ads Council. Runs OFF-Vercel (local
 * ffmpeg). Idempotent: skips ads whose creative_hash is unchanged.
 *
 *   npx tsx scripts/analyze-creatives.ts            # all active BOSS ads
 *   npx tsx scripts/analyze-creatives.ts --ad <id>  # one ad (test)
 *   npx tsx scripts/analyze-creatives.ts --force     # re-analyze all
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
for (const src of [resolve('.env.local')]) {
  if (!existsSync(src)) continue;
  for (const line of readFileSync(src, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    const v = m?.[2]?.trim().replace(/^["']|["']$/g, '');
    if (m && v && !process.env[m[1]]) process.env[m[1]] = v;
  }
}

const ONE = process.argv.includes('--ad') ? process.argv[process.argv.indexOf('--ad') + 1] : null;
const FORCE = process.argv.includes('--force');

async function main() {
  const { analyzeAdCreative } = await import('@/lib/council/creative-context');
  const { getSupabase } = await import('@/lib/supabase');
  const sb = getSupabase();

  let ads: { ad_id: string; ad_name: string }[];
  if (ONE) {
    ads = [{ ad_id: ONE, ad_name: 'test-ad' }];
  } else {
    // active BOSS ads seen in the last 21 days (paginate the metrics table)
    const seen = new Map<string, string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.from('ad_metrics_daily').select('ad_id,ad_name,date')
        .eq('brand', 'BOSS').gte('date', new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10))
        .range(from, from + 999);
      const rows = (data ?? []) as { ad_id: string; ad_name: string }[];
      for (const r of rows) if (!seen.has(r.ad_id)) seen.set(r.ad_id, r.ad_name);
      if (rows.length < 1000) break;
    }
    ads = [...seen].map(([ad_id, ad_name]) => ({ ad_id, ad_name }));
  }

  // Without --force, skip ads that already have a context row entirely — no
  // Graph call at all. Makes re-runs (recovering the last run's failures)
  // cheap and gentle on Meta, and preserves the DB's newest-first hash check
  // for the ones we do touch.
  let already = 0;
  if (!FORCE && !ONE) {
    const { data } = await sb.from('ad_creative_context').select('ad_id').eq('brand', 'BOSS');
    const have = new Set(((data ?? []) as { ad_id: string }[]).map((r) => r.ad_id));
    const before = ads.length;
    ads = ads.filter((a) => !have.has(a.ad_id));
    already = before - ads.length;
  }
  console.log(`analyzing ${ads.length} ad(s)${FORCE ? ' (force)' : ''}${already ? ` · ${already} already done` : ''}…`);

  let ok = 0, skip = 0, fail = 0;
  for (const a of ads) {
    const r = await analyzeAdCreative(a.ad_id, a.ad_name, 'BOSS', { force: FORCE });
    if ('ok' in r) { ok++; console.log(`  ✓ ${a.ad_name.slice(0, 34).padEnd(34)} ${r.context.mediaType}/${r.context.angle}/${r.context.persona} q${r.context.visualQuality ?? '?'}`); }
    else if (r.error === 'unchanged') { skip++; }
    else { fail++; console.log(`  ✗ ${a.ad_name.slice(0, 34).padEnd(34)} ${r.error}`); }
    await new Promise((res) => setTimeout(res, 800)); // pace Meta calls
  }
  console.log(`\ndone — ${ok} analyzed · ${skip} unchanged · ${fail} failed${already ? ` · ${already} skipped (already done)` : ''}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
