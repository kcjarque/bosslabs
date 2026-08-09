# Prince Analysis v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Prince into a complete senior media buyer with business-owner acumen — profit-anchored (ROAS≥2 / CPP≤₱650 / ₱50k-day-net), week-focused, evidence-tiered, and reasoning through a 5-stage cross-checked method — without over-analyzing.

**Architecture:** Additive layers on the existing `lib/council/*` engine. A profit-anchor (`economics.ts`) + a Mon–Sun narrative window (`weekWindow`) + confidence tiers + a malfunction pre-check feed a re-shaped `SessionJson`. The weekly path runs a staged multi-pass council (Opus); `/prince` runs one fast pass (Sonnet); the daily pulse stays deterministic. The deterministic `gradeAd` tier engine and the paused-ad rule are left untouched.

**Tech Stack:** Next.js 14 App Router · TypeScript · cloud Supabase (`hsbowpbuqlctxeglpqyd`) · Meta Graph v23 · Anthropic Messages API · `node:test` + `tsx` for unit tests.

## Global Constraints

- **Spec is authority:** `docs/ads-council/2026-08-09-prince-analysis-v2-design.md`. Every task traces to a section.
- **Economics defaults (BOSS):** `targetRoas=2.0`, `breakevenRoas=1.04`, `targetCppCentavos=65000` (₱650), `processingFeePct=0.035`, `dailyNetTargetCentavos=5000000` (₱50k), `backEndNote=''`. All editable in settings.
- **North-star math:** `dailyNet = spend × (roas×(1−fee) − 1)`; `targetNetSpend = dailyNetTarget / (targetRoas×(1−fee) − 1)`.
- **Confidence tiers:** SOLID ≥10 purchases OR spend ≥3× blended CPA; DIRECTIONAL ≥3 purchases OR spend ≥1× blended CPA; else NOISE. No cut/scale on NOISE. Day-of-week capped DIRECTIONAL.
- **Severity floor:** problems with plausible impact < ~5% of weekly spend go to `watchlist`, not the briefing.
- **Units:** cpp/spend/revenue = centavos; cpm = pesos; ctr/cvr/roas ratios/percent as noted. Never mix.
- **Exactly ONE migration** (council_settings economics columns). Everything else live/derived. No nightly-sync field changes.
- **Untouched:** §2 temporal deterministic tiers (`windowsFor`/`gradeAd`), the shipped paused-ad rule, unit conventions, Telegram escape-then-bold.
- **Test convention:** pure logic → `lib/council/<name>.test.ts` with `node:test`+`node:assert/strict`, run `npx tsx --test <file>`. Integration → tsx probe under `scripts/probes/`, run `set -a; . ./.env.local; set +a; npx tsx <probe>`.
- **Commit cadence:** one commit per task. Co-author trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Per-phase gate:** each phase ends with `npx tsc --noEmit` + `./node_modules/.bin/next build` clean before the phase is "done".

---

## Phase 0 — Economics foundation (profit anchor)

*Spec §3h. The backbone of the business-owner framing. Shippable alone: settings carry economics; a pure helper computes net + gap.*

### Task 0.1: Migration — economics columns on council_settings

**Files:**
- Create: `supabase/migrations/0057_council_economics.sql`

**Interfaces:**
- Produces: columns `target_roas`, `breakeven_roas`, `processing_fee_pct`, `daily_net_target_centavos`, `back_end_note` on `council_settings`; BOSS `target_cpp_centavos` bumped 50000→65000.

- [ ] **Step 1: Write the migration**

```sql
-- 0057_council_economics.sql — profit anchor (spec §3h). Idempotent.
alter table council_settings
  add column if not exists target_roas numeric not null default 2.0,
  add column if not exists breakeven_roas numeric not null default 1.04,
  add column if not exists processing_fee_pct numeric not null default 0.035,
  add column if not exists daily_net_target_centavos bigint not null default 5000000,
  add column if not exists back_end_note text not null default '';

-- Bring the BOSS CPP ceiling to ₱650 only if it is still the old ₱500 default.
update council_settings set target_cpp_centavos = 65000
  where brand = 'BOSS' and target_cpp_centavos = 50000;
```

- [ ] **Step 2: Apply to cloud** (curl + jq, NOT python urllib)

```bash
cd /Users/kylejarque/Documents/Claude/bosslabs-ai
set -a; . ./.env.local; set +a
curl -s -X POST "https://api.supabase.com/v1/projects/hsbowpbuqlctxeglpqyd/database/query" \
  -H "Authorization: Bearer $SUPABASE_BOSSLABS_TOKEN" -H "Content-Type: application/json" \
  --data "$(jq -Rs '{query: .}' supabase/migrations/0057_council_economics.sql)" | jq .
```
Expected: `[]` (no error object).

- [ ] **Step 3: Verify columns + BOSS row**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/hsbowpbuqlctxeglpqyd/database/query" \
  -H "Authorization: Bearer $SUPABASE_BOSSLABS_TOKEN" -H "Content-Type: application/json" \
  --data '{"query":"select brand,target_cpp_centavos,target_roas,breakeven_roas,processing_fee_pct,daily_net_target_centavos from council_settings"}' | jq .
```
Expected: BOSS row shows `target_cpp_centavos: 65000`, `target_roas: 2.0`, `daily_net_target_centavos: 5000000`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0057_council_economics.sql
git commit -m "feat(council): migration — economics columns on council_settings (§3h)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 0.2: Settings type + reader carry economics

**Files:**
- Modify: `lib/council/types.ts` (CouncilSettingsRow)
- Modify: `lib/council/db.ts` (`getCouncilSettings` mapper `CouncilSettingsRowDb`, ~L206-226)

**Interfaces:**
- Consumes: migration 0057 columns.
- Produces: `CouncilSettingsRow` gains `targetRoas, breakevenRoas, processingFeePct, dailyNetTargetCentavos, backEndNote`.

- [ ] **Step 1: Extend the type**

```ts
// lib/council/types.ts
export type CouncilSettingsRow = {
  brand: Brand; mode: Mode; targetCppCentavos: number;
  targetRoas: number; breakevenRoas: number; processingFeePct: number;
  dailyNetTargetCentavos: number; backEndNote: string;
};
```

- [ ] **Step 2: Map the new columns in `getCouncilSettings`**

```ts
// lib/council/db.ts — CouncilSettingsRowDb + the return mapper
type CouncilSettingsRowDb = {
  brand: string; mode: string; target_cpp_centavos: number;
  target_roas: number; breakeven_roas: number; processing_fee_pct: number;
  daily_net_target_centavos: number; back_end_note: string;
};
// in getCouncilSettings, widen the select to '*' (or the explicit column list) and return:
return {
  brand: r.brand as Brand, mode: r.mode as Mode, targetCppCentavos: r.target_cpp_centavos,
  targetRoas: r.target_roas, breakevenRoas: r.breakeven_roas, processingFeePct: r.processing_fee_pct,
  dailyNetTargetCentavos: r.daily_net_target_centavos, backEndNote: r.back_end_note ?? '',
};
```
Also update the settings upsert writer (same file, ~L226) to persist the five new fields.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (fix any CouncilSettingsRow literal in tests/factories to include the new fields).

- [ ] **Step 4: Live read probe**

```bash
cat > scripts/probes/economics-read.ts <<'EOF'
import { getCouncilSettings } from '@/lib/council/db';
(async () => console.log(await getCouncilSettings('BOSS' as any)))();
EOF
set -a; . ./.env.local; set +a; npx tsx scripts/probes/economics-read.ts
```
Expected: object with `targetRoas: 2`, `targetCppCentavos: 65000`, `dailyNetTargetCentavos: 5000000`.

- [ ] **Step 5: Commit**

```bash
git add lib/council/types.ts lib/council/db.ts scripts/probes/economics-read.ts
git commit -m "feat(council): settings row carries economics (§3h)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 0.3: `economics.ts` — north-star math (pure, TDD)

**Files:**
- Create: `lib/council/economics.ts`
- Test: `lib/council/economics.test.ts`

**Interfaces:**
- Consumes: `CouncilSettingsRow`.
- Produces: `type Economics`; `economicsFromSettings(s)`; `dailyNetCentavos(spendCentavos, roas, feePct)`; `targetNetSpendCentavos(dailyNetTargetCentavos, targetRoas, feePct)`; `netGapCentavos(currentNetCentavos, targetNetCentavos)`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/council/economics.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyNetCentavos, targetNetSpendCentavos, netGapCentavos } from './economics';

test('dailyNet: 2.49x on ₱17,700/day nets ~₱24.8k (fee 3.5%)', () => {
  const net = dailyNetCentavos(1_770_000, 2.49, 0.035);
  assert.ok(Math.abs(net - 2_484_255) < 5_000, `got ${net}`); // 1.77M × (2.49×0.965 − 1)
});
test('dailyNet: at breakeven 1.04x net ≈ 0', () => {
  assert.ok(Math.abs(dailyNetCentavos(1_000_000, 1.04, 0.035)) < 4_000);
});
test('targetNetSpend: ₱50k/day net at 2.0x needs ~₱53.8k/day spend', () => {
  const spend = targetNetSpendCentavos(5_000_000, 2.0, 0.035);
  assert.ok(Math.abs(spend - 5_376_344) < 20_000, `got ${spend}`); // 5M / (2×0.965 − 1)=5M/0.93
});
test('netGap is target minus current', () => {
  assert.equal(netGapCentavos(2_480_000, 5_000_000), 2_520_000);
});
```

- [ ] **Step 2: Run it, verify failure**

Run: `npx tsx --test lib/council/economics.test.ts`
Expected: FAIL (module not found / exports missing).

- [ ] **Step 3: Implement**

```ts
// lib/council/economics.ts — profit anchor math (spec §3h). All centavos in/out.
import type { CouncilSettingsRow } from './types';

export type Economics = {
  targetRoas: number; breakevenRoas: number; targetCppCentavos: number;
  processingFeePct: number; dailyNetTargetCentavos: number; backEndNote: string;
  configured: boolean; // false → Prince must say "no profit anchor" + read conservatively
};

export function economicsFromSettings(s: CouncilSettingsRow): Economics {
  const configured = s.targetRoas > 0 && s.dailyNetTargetCentavos > 0;
  return {
    targetRoas: s.targetRoas || 1.0,
    breakevenRoas: s.breakevenRoas || 1 / (1 - (s.processingFeePct || 0.035)),
    targetCppCentavos: s.targetCppCentavos,
    processingFeePct: s.processingFeePct ?? 0.035,
    dailyNetTargetCentavos: s.dailyNetTargetCentavos || 0,
    backEndNote: s.backEndNote || '',
    configured,
  };
}

/** Net profit for a day: revenue − spend − processing, where revenue = spend×roas. */
export function dailyNetCentavos(spendCentavos: number, roas: number, feePct: number): number {
  return Math.round(spendCentavos * (roas * (1 - feePct) - 1));
}

/** Spend/day needed to hit a net target AT a given ROAS. 0 if the ROAS can't clear breakeven. */
export function targetNetSpendCentavos(dailyNetTargetCentavos: number, targetRoas: number, feePct: number): number {
  const perPeso = targetRoas * (1 - feePct) - 1;
  return perPeso > 0 ? Math.round(dailyNetTargetCentavos / perPeso) : 0;
}

export function netGapCentavos(currentNetCentavos: number, targetNetCentavos: number): number {
  return targetNetCentavos - currentNetCentavos;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx tsx --test lib/council/economics.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add lib/council/economics.ts lib/council/economics.test.ts
git commit -m "feat(council): economics.ts north-star math + tests (§3h)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Phase 0 gate:** `npx tsc --noEmit` && `./node_modules/.bin/next build` clean.

---

## Phase 1 — Temporal spine + ROAS core

*Spec §2, §3a. Backbone: a Mon–Sun narrative window carrying ROAS/AOV, feeding a `thisWeek`/`context`-labeled pack. Leaves `windowsFor`/tiers untouched.*

### Task 1.1: `weekWindow()` — Mon–Sun metrics + ROAS + settled split (pure, TDD)

**Files:**
- Modify: `lib/council/verdict-engine.ts` (add `weekWindow`; do NOT change `windowsFor`/`gradeAd`)
- Test: `lib/council/week-window.test.ts`

**Interfaces:**
- Consumes: `AdSeries`, calendar `weekStart`/`weekEnd` (YYYY-MM-DD), `settledCutoff` (YYYY-MM-DD, =today−3).
- Produces: `weekWindow(series, weekStart, weekEnd, settledCutoff)` → `{ spend, revenue, purchases, linkClicks, impressions, reach, roas, cpp, aov, cpm, linkCtr, cvr, freq, hookRate, holdRate, lpViewRate, viewToPurchase, settled: {spend,revenue,purchases,roas,cpp}, priorWeek: {spend,revenue,roas,cpp} }`. All money centavos; roas ratio; ctr/cvr/rates %.

- [ ] **Step 1: Write the failing test**

```ts
// lib/council/week-window.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekWindow } from './verdict-engine';
import type { AdSeries } from './types';

const day = (date: string, o: Partial<AdSeries['days'][number]> = {}) => ({
  date, spendCentavos: 100_000, impressions: 10_000, reach: 8_000, frequency: 1.25,
  ctr: 1.5, linkCtr: 1.0, cpm: 100, linkClicks: 100, purchases: 2, revenueCentavos: 250_000,
  video3s: 0, thruplays: 0, lpViews: 80, ...o,
});
const series = (days: AdSeries['days']): AdSeries => ({
  brand: 'BOSS' as any, campaignId: 'c', campaignName: 'C', adsetId: 'a', adsetName: 'A',
  adId: 'ad1', adName: 'Ad 1', days,
});

test('weekWindow sums the Mon–Sun span and computes ROAS/AOV', () => {
  // week Mon 2026-08-03 .. Sun 2026-08-09; settledCutoff = 2026-08-06 (Thu)
  const s = series(['2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07']
    .map((d) => day(d)));
  const w = weekWindow(s, '2026-08-03', '2026-08-09', '2026-08-06');
  assert.equal(w.spend, 500_000);            // 5 days × ₱1,000
  assert.equal(w.revenue, 1_250_000);        // 5 × ₱2,500
  assert.equal(w.purchases, 10);
  assert.ok(Math.abs(w.roas - 2.5) < 1e-9);  // 1.25M / 500k
  assert.equal(w.aov, 125_000);              // 1.25M / 10
  assert.equal(w.settled.spend, 400_000);    // only ≤ 2026-08-06 (4 days)
});

test('weekWindow prior week = the preceding Mon–Sun', () => {
  const s = series([day('2026-07-27'), day('2026-07-28'), day('2026-08-03')]);
  const w = weekWindow(s, '2026-08-03', '2026-08-09', '2026-08-06');
  assert.equal(w.priorWeek.spend, 200_000);  // Jul 27 + Jul 28 fall in prior Mon–Sun
});
```

- [ ] **Step 2: Run it, verify failure**

Run: `npx tsx --test lib/council/week-window.test.ts`
Expected: FAIL (`weekWindow` not exported).

- [ ] **Step 3: Implement `weekWindow`** (append to verdict-engine.ts; reuse the file's `sum`/`avg` helpers)

```ts
// lib/council/verdict-engine.ts — ADD (windowsFor + gradeAd unchanged)
const isoBefore = (d: string, days: number) => new Date(Date.parse(d) - days * MS_DAY).toISOString().slice(0, 10);

export function weekWindow(series: AdSeries, weekStart: string, weekEnd: string, settledCutoff: string) {
  const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
  const wk = series.days.filter((d) => inRange(d.date, weekStart, weekEnd));
  const settled = wk.filter((d) => d.date <= settledCutoff);
  const pStart = isoBefore(weekStart, 7), pEnd = isoBefore(weekStart, 1);
  const pw = series.days.filter((d) => inRange(d.date, pStart, pEnd));

  const agg = (rows: typeof wk) => {
    const spend = sum(rows.map((d) => d.spendCentavos));
    const revenue = sum(rows.map((d) => d.revenueCentavos));
    const purchases = sum(rows.map((d) => d.purchases));
    const linkClicks = sum(rows.map((d) => d.linkClicks));
    const impressions = sum(rows.map((d) => d.impressions));
    const reach = sum(rows.map((d) => d.reach));
    const video3s = sum(rows.map((d) => d.video3s));
    const thruplays = sum(rows.map((d) => d.thruplays));
    const lpViews = sum(rows.map((d) => d.lpViews));
    const isVideo = impressions > 0 && video3s >= impressions * 0.1;
    return {
      spend, revenue, purchases, linkClicks, impressions, reach,
      roas: spend > 0 ? revenue / spend : null,
      cpp: purchases > 0 ? spend / purchases : null,
      aov: purchases > 0 ? Math.round(revenue / purchases) : null,
      cpm: impressions > 0 ? (spend / 100 / impressions) * 1000 : null,
      linkCtr: impressions > 0 ? (linkClicks / impressions) * 100 : null,
      cvr: linkClicks > 0 ? (purchases / linkClicks) * 100 : null,
      freq: reach > 0 ? impressions / reach : null,
      hookRate: isVideo ? (video3s / impressions) * 100 : null,
      holdRate: isVideo ? (thruplays / video3s) * 100 : null,
      lpViewRate: linkClicks > 0 ? (lpViews / linkClicks) * 100 : null,
      viewToPurchase: lpViews > 0 ? (purchases / lpViews) * 100 : null,
    };
  };

  const full = agg(wk), s = agg(settled), p = agg(pw);
  return {
    ...full,
    settled: { spend: s.spend, revenue: s.revenue, purchases: s.purchases, roas: s.roas, cpp: s.cpp },
    priorWeek: { spend: p.spend, revenue: p.revenue, roas: p.roas, cpp: p.cpp },
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx tsx --test lib/council/week-window.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add lib/council/verdict-engine.ts lib/council/week-window.test.ts
git commit -m "feat(council): weekWindow — Mon–Sun ROAS/AOV window + settled split (§2,§3a)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 1.2: Pack — Mon–Sun anchoring + `thisWeek`/`context` grouping + economics

**Files:**
- Modify: `lib/council/pack.ts` (CouncilPack type + `assemblePack`)
- Modify: `lib/council/pack.test.ts` (create if absent)

**Interfaces:**
- Consumes: `weekWindow`, `economicsFromSettings`, `dailyNetCentavos`, `targetNetSpendCentavos`, `netGapCentavos`.
- Produces: `CouncilPack` gains `weekStart, weekEnd, settledCutoff`, a `thisWeek` block (campaign + ads[].week + `northStar:{currentDailyNetCentavos,targetNetSpendCentavos,netGapCentavos}`), and `settings.economics`. Existing `ads[]`/`campaign` stay for back-compat during migration but new prompts read `thisWeek`.

- [ ] **Step 1: Compute the week bounds** — in `assemblePack`, derive from `asOfSettled`:

```ts
// weekEnd = the Sunday of the just-finished week; weekStart = that Monday; settledCutoff = asOfSettled.
// The weekly cron runs Sunday, so the "just-finished Mon–Sun" is the week CONTAINING (asOfSettled+3)=today.
const today = new Date(Date.parse(asOfSettled) + 3 * MS_DAY).toISOString().slice(0, 10);
const weekEnd = /* Sunday of `today`'s ISO week */ (() => { const d = new Date(`${today}T00:00:00Z`); const dow = d.getUTCDay(); d.setUTCDate(d.getUTCDate() + (dow === 0 ? 0 : 7 - dow)); return d.toISOString().slice(0,10); })();
const weekStart = isoDaysBefore(weekEnd, 6);
const settledCutoff = asOfSettled;
```

- [ ] **Step 2: Build `thisWeek` from `weekWindow` per ad + blended**, and the north-star block:

```ts
const econ = economicsFromSettings(settings);
const weekAds = series.map((s) => ({ s, w: weekWindow(s, weekStart, weekEnd, settledCutoff) }))
  .filter(({ w }) => w.spend > 0 || w.impressions > 0);
const twSpend = weekAds.reduce((a, {w}) => a + w.spend, 0);
const twRev = weekAds.reduce((a, {w}) => a + w.revenue, 0);
const twPurch = weekAds.reduce((a, {w}) => a + w.purchases, 0);
const blendedRoas = twSpend > 0 ? twRev / twSpend : null;
const days = Math.max(1, (Date.parse(weekEnd) - Date.parse(weekStart)) / MS_DAY + 1);
const currentDailyNet = blendedRoas != null ? dailyNetCentavos(twSpend / days, blendedRoas, econ.processingFeePct) : 0;
const northStar = {
  currentDailyNetCentavos: Math.round(currentDailyNet),
  targetNetSpendCentavos: targetNetSpendCentavos(econ.dailyNetTargetCentavos, econ.targetRoas, econ.processingFeePct),
  netGapCentavos: netGapCentavos(Math.round(currentDailyNet), econ.dailyNetTargetCentavos),
};
```

- [ ] **Step 3: Assemble `thisWeek` + attach `settings.economics`**; add the fields to `CouncilPack` type (campaign: spend/revenue/roas/cpp/aov/cpm/linkCtr/cvr/reach/freq + priorWeek twins + settled; ads[].week from `weekWindow`; `northStar`; `pacing`/`breakdowns`/`funnel` added in later phases as optional).

- [ ] **Step 4: Unit test the week bounds + north star** with a fixture pack input:

```ts
// lib/council/pack.test.ts (bounds + northStar only — no network)
import { test } from 'node:test';
import assert from 'node:assert/strict';
// import a small exported helper `deriveWeekBounds(asOfSettled)` you factor out in Step 1
import { deriveWeekBounds } from './pack';
test('Sunday-run week bounds: asOf Thu 08-06 → Mon 08-03..Sun 08-09', () => {
  const b = deriveWeekBounds('2026-08-06');
  assert.equal(b.weekStart, '2026-08-03');
  assert.equal(b.weekEnd, '2026-08-09');
  assert.equal(b.settledCutoff, '2026-08-06');
});
```
(Refactor the Step-1 bound math into an exported `deriveWeekBounds(asOfSettled)` so it's unit-testable.)

- [ ] **Step 5: Run + verify + typecheck**

Run: `npx tsx --test lib/council/pack.test.ts` → PASS. Then `npx tsc --noEmit` → clean.

- [ ] **Step 6: Live pack probe** — confirm ROAS matches the ~2.49× blded and bounds are the just-finished Mon–Sun:

```bash
cat > scripts/probes/pack-week.ts <<'EOF'
import { assemblePack } from '@/lib/council/pack';
import { settledDay } from '@/lib/council/session';
(async () => {
  const p: any = await assemblePack('BOSS' as any, settledDay());
  console.log('week', p.weekStart, '..', p.weekEnd, 'cutoff', p.settledCutoff);
  console.log('blendedRoas', p.thisWeek?.campaign?.roas, 'northStar', p.thisWeek?.northStar);
  console.log('economics', p.settings?.economics);
})();
EOF
set -a; . ./.env.local; set +a; npx tsx scripts/probes/pack-week.ts
```
Expected: weekStart/weekEnd a Mon/Sun pair; blendedRoas ≈ 2.4–2.6; economics present.

- [ ] **Step 7: Commit**

```bash
git add lib/council/pack.ts lib/council/pack.test.ts scripts/probes/pack-week.ts
git commit -m "feat(council): pack Mon–Sun thisWeek block + ROAS + north-star + economics (§2,§3a,§3h)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 1.3: `weeklyTrend` gains roas + revenue

**Files:** Modify `lib/council/pack.ts` (the `weeklyTrend` mapper).

- [ ] **Step 1:** In the `weekAgg` accumulation add `rev` per ISO week; in the `weeklyTrend` map add `roas: a.spend>0 ? a.rev/a.spend : null` and `revenue: a.rev`.
- [ ] **Step 2:** Update the `CouncilPack.weeklyTrend` type to include `roas: number|null; revenue: number`.
- [ ] **Step 3:** `npx tsc --noEmit` → clean; re-run `scripts/probes/pack-week.ts` extended to print `p.context.weeklyTrend` (4 rows, each with roas).
- [ ] **Step 4: Commit** `feat(council): 4-week ROAS/revenue movement arc (§3a)`.

**Phase 1 gate:** `npx tsc --noEmit` && `./node_modules/.bin/next build` clean.

---

## Phase 2 — Objective/optimization awareness + BUG-3

*Spec §3b, §1a. Fetch objective/optimization/bid/attribution; fix the GUIDED_CREATION mislabel.*

### Task 2.1: Extend `getCampaignStructures` + fix ADVANTAGE+ detection

**Files:**
- Modify: `lib/meta-ads.ts` (`CampaignStructure` type + `getCampaignStructures`)
- Test: `lib/meta-ads.budgettype.test.ts` (pure `budgetType` helper only)

**Interfaces:**
- Produces: `CampaignStructure` gains `objective: string`; each ad set gains `optimizationGoal, bidStrategy, customEventType, attributionSpec`. New exported pure helper `deriveBudgetType({smartPromotionType, campDaily, campLifetime, anyAdsetBudget})`.

- [ ] **Step 1: Failing test for the BUG-3 fix**

```ts
// lib/meta-ads.budgettype.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveBudgetType } from './meta-ads';
test('GUIDED_CREATION is NOT ADVANTAGE+ (BUG-3)', () => {
  assert.equal(deriveBudgetType({ smartPromotionType: 'GUIDED_CREATION', campDaily: 500000, campLifetime: 0, anyAdsetBudget: false }), 'CBO');
});
test('SMART_PROMOTION → ADVANTAGE+', () => {
  assert.equal(deriveBudgetType({ smartPromotionType: 'SMART_PROMOTION', campDaily: 0, campLifetime: 0, anyAdsetBudget: false }), 'ADVANTAGE+');
});
test('adset budget only → ABO', () => {
  assert.equal(deriveBudgetType({ smartPromotionType: '', campDaily: 0, campLifetime: 0, anyAdsetBudget: true }), 'ABO');
});
```

- [ ] **Step 2:** Run `npx tsx --test lib/meta-ads.budgettype.test.ts` → FAIL.

- [ ] **Step 3: Implement the helper + wire it** (replace the inline `budgetType` ternary):

```ts
// lib/meta-ads.ts
export function deriveBudgetType(x: { smartPromotionType: string; campDaily: number; campLifetime: number; anyAdsetBudget: boolean }):
  'CBO' | 'ABO' | 'ADVANTAGE+' | 'unknown' {
  // GUIDED_CREATION is a normal guided-flow marker, NOT Advantage+ (BUG-3). Only SMART_PROMOTION = ASC/automated.
  if (x.smartPromotionType === 'SMART_PROMOTION') return 'ADVANTAGE+';
  if (x.campDaily || x.campLifetime) return 'CBO';
  if (x.anyAdsetBudget) return 'ABO';
  return 'unknown';
}
```
Widen the campaign graph call to `id,name,daily_budget,lifetime_budget,smart_promotion_type,objective`; widen the adsets call to add `optimization_goal,bid_strategy,promoted_object,attribution_spec`; map `optimizationGoal`, `bidStrategy`, `customEventType = promoted_object?.custom_event_type ?? null`, `attributionSpec` (stringify the spec array). Set `objective` on the returned structure. Replace the old ternary with `deriveBudgetType(...)`.

- [ ] **Step 4:** Run test → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Live probe** — confirm all 3 campaigns no longer read ADVANTAGE+ and objective is present:

```bash
cat > scripts/probes/structure.ts <<'EOF'
import { getCampaignStructures } from '@/lib/meta-ads';
(async () => { for (const c of await getCampaignStructures()) console.log(c.name, '|', c.budgetType, '|', (c as any).objective); })();
EOF
set -a; . ./.env.local; set +a; npx tsx scripts/probes/structure.ts
```
Expected: `BOSSLABS AI | SALES | CBO | OUTCOME_SALES` (NOT ADVANTAGE+); the real ASC campaign shows ADVANTAGE+ only if it returns SMART_PROMOTION.

- [ ] **Step 6: Commit** `fix(council): objective/optimization/attribution + BUG-3 GUIDED_CREATION mislabel (§3b,§1a)`.

**Phase 2 gate:** typecheck + build clean.

---

## Phase 3 — Reasoning core (5-stage, confidence, malfunction, new SessionJson, persona)

*Spec §0, §0b, §5a. The brain: confidence tiers, malfunction pre-check, the 5-stage `SessionJson`, and the persona/output-discipline/method prompt.*

### Task 3.1: `confidence.ts` — signal tiers (pure, TDD)

**Files:** Create `lib/council/confidence.ts` + `lib/council/confidence.test.ts`.

**Interfaces:** Produces `type Confidence = 'SOLID'|'DIRECTIONAL'|'NOISE'`; `confidenceFor(purchases, spendCentavos, blendedCppCentavos): Confidence`.

- [ ] **Step 1: Failing test**

```ts
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { confidenceFor } from './confidence';
const CPA = 65_000; // ₱650 blended CPA
test('≥10 purchases = SOLID', () => assert.equal(confidenceFor(12, 50_000, CPA), 'SOLID'));
test('spend ≥3× CPA = SOLID', () => assert.equal(confidenceFor(1, 200_000, CPA), 'SOLID'));
test('≥3 purchases = DIRECTIONAL', () => assert.equal(confidenceFor(4, 10_000, CPA), 'DIRECTIONAL'));
test('7_Manual2 ₱929 spend on ₱650 CPA, 5 buyers = DIRECTIONAL not SOLID', () => assert.equal(confidenceFor(5, 92_900, CPA), 'DIRECTIONAL'));
test('₱250 spend, 0 buyers = NOISE', () => assert.equal(confidenceFor(0, 25_000, CPA), 'NOISE'));
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement**

```ts
// lib/council/confidence.ts (spec §0b minimum-signal)
export type Confidence = 'SOLID' | 'DIRECTIONAL' | 'NOISE';
export function confidenceFor(purchases: number, spendCentavos: number, blendedCppCentavos: number): Confidence {
  const cpa = blendedCppCentavos > 0 ? blendedCppCentavos : 65_000;
  if (purchases >= 10 || spendCentavos >= 3 * cpa) return 'SOLID';
  if (purchases >= 3 || spendCentavos >= cpa) return 'DIRECTIONAL';
  return 'NOISE';
}
```

- [ ] **Step 4:** Run → PASS (5/5).
- [ ] **Step 5: Commit** `feat(council): confidence tiers (§0b minimum-signal)`.

### Task 3.2: `malfunction.ts` — deterministic outage pre-check (pure, TDD)

**Files:** Create `lib/council/malfunction.ts` + `lib/council/malfunction.test.ts`.

**Interfaces:** Consumes `AdSeries[]`, `adStatus: Map<string,string>`, `asOf`. Produces `type Malfunction = {adId,adName,kind:'DISAPPROVED'|'REVENUE_CLIFF'|'LP_COLLAPSE',detail:string}`; `detectMalfunctions(series, adStatus, asOf): Malfunction[]`.

- [ ] **Step 1: Failing test**

```ts
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { detectMalfunctions } from './malfunction';
const mk = (adId: string, days: any[]) => ({ brand:'BOSS', campaignId:'c',campaignName:'C',adsetId:'a',adsetName:'A',adId,adName:adId,days });
const d = (date: string, spend: number, purch: number, rev: number, lp = 50, clicks = 60) =>
  ({ date, spendCentavos: spend, impressions: 5000, reach: 4000, frequency: 1.2, ctr: 1, linkCtr: 1, cpm: 80, linkClicks: clicks, purchases: purch, revenueCentavos: rev, video3s: 0, thruplays: 0, lpViews: lp });
test('WITH_ISSUES ad flagged DISAPPROVED', () => {
  const out = detectMalfunctions([mk('x',[d('2026-08-06',100000,2,250000)])], new Map([['x','WITH_ISSUES']]), '2026-08-06');
  assert.equal(out[0].kind, 'DISAPPROVED');
});
test('spend continues but revenue cliffs to 0 = REVENUE_CLIFF', () => {
  const days = [d('2026-08-04',100000,3,300000), d('2026-08-05',100000,3,300000), d('2026-08-06',100000,0,0)];
  const out = detectMalfunctions([mk('y',days)], new Map([['y','ACTIVE']]), '2026-08-06');
  assert.equal(out.find(m=>m.adId==='y')?.kind, 'REVENUE_CLIFF');
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** — DISAPPROVED when status==='WITH_ISSUES'; REVENUE_CLIFF when the asOf day has spend ≥ ~1× target-ish (use ₱500 floor) AND purchases=0 AND the prior 2 settled days averaged ≥1 purchase; LP_COLLAPSE when lpViews/linkClicks on asOf < 20% of the prior-2-day average with ≥30 clicks. Return one entry per detected condition.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(council): malfunction pre-check (§0b rule-out-first)`.

### Task 3.3: Wire confidence + malfunction into the pack

**Files:** Modify `lib/council/pack.ts`.

- [ ] **Step 1:** For each `thisWeek.ads[]`, compute `evidenceConfidence = confidenceFor(w.purchases, w.spend, blendedCppCentavos)` and attach `week.confidence`.
- [ ] **Step 2:** Call `detectMalfunctions(series, adStatus, asOfSettled)` (best-effort; `adStatus` already fetched in the pack) and attach `pack.malfunctions`.
- [ ] **Step 3:** Add both to `CouncilPack` type. `npx tsc --noEmit` → clean.
- [ ] **Step 4:** Extend `scripts/probes/pack-week.ts` to print `p.malfunctions` + a sample `ads[].week.confidence`; run it. Expected: the 2 WITH_ISSUES ads appear in `malfunctions`.
- [ ] **Step 5: Commit** `feat(council): attach confidence tier + malfunctions to pack (§0b)`.

### Task 3.4: New `SessionJson` shape + validator + persona/method prompt

**Files:** Modify `lib/council/session.ts` (types `SessionJson`, `validateSessionJson`, the system prompt string, `output_schema`).

**Interfaces:** Produces `SessionJson` with `problems:[{type:ProblemType,description,severity,pesoImpact,evidence:{confidence:Confidence,text}}]`, `solutions:[{problem,fix,lever,expectedEffect}]`, `synthesis:string`, `watchlist:[{item,why}]`, plus the existing `diagnosis`/`action_plan`/`creative_ideas`/`verdict`/`transcript_md` retained. `type ProblemType = 'malfunction'|'creative'|'fatigue'|'audience'|'offer'|'setup'|'algorithm'|'market'`.

- [ ] **Step 1:** Define the new types + `ProblemType` union.
- [ ] **Step 2:** Rewrite the RUNTIME-RULES system prompt to encode, in order: **§0 persona** (senior buyer + owner mindset, earn-more/spend-less, adapts to scale), **§0b 5-stage method** (malfunction→creative→fatigue→audience→offer→setup→algorithm→market; NULL-RESULT LAW; MINIMUM-SIGNAL confidence tiers; no cut/scale on NOISE), **§3h profit anchor** (judge vs targetRoas/breakevenRoas/targetCppCentavos + ₱50k/day net gap using `pack.thisWeek.northStar`), **§2 SCOPE law** (judge the Mon–Sun week; history=context), **§5a output discipline** (lead with decision, cite 1–3 numbers, severity floor→watchlist, scaling-velocity guardrail), then the existing DIAGNOSTIC_SPINE/CREATIVE/STRUCTURE/MOVEMENT/CREATIVE_IDEAS/UNIT rules. Update `output_schema` string to the new shape.
- [ ] **Step 3:** Update `validateSessionJson` to default-fill `problems`/`solutions`/`synthesis`/`watchlist` when absent (never throw), preserving the existing safe-default behavior.
- [ ] **Step 4:** `npx tsc --noEmit` → clean.
- [ ] **Step 5: Commit** `feat(council): 5-stage SessionJson + persona/method/profit-anchor prompt (§0,§0b,§3h,§5a)`.

### Task 3.5: Same persona + method in `/prince` (single pass)

**Files:** Modify `lib/council/prince.ts` (PRINCE_SYSTEM).

- [ ] **Step 1:** Prepend the §0 persona + §0b method (as a single fast pass — "run the 5 stages internally, then answer") + §3h profit anchor (use `pack.thisWeek.northStar`) + §5a output discipline + confidence rule. Keep the existing UNITS block, CPP-waterfall, structure/movement/active rules.
- [ ] **Step 2:** `npx tsc --noEmit` → clean.
- [ ] **Step 3: Live `/prince` dry-run**

```bash
cat > scripts/probes/prince-ask.ts <<'EOF'
import { askPrince } from '@/lib/council/prince';
(async () => console.log(await askPrince('are we on track for ₱50k/day net? what is the one move?')))();
EOF
set -a; . ./.env.local; set +a; npx tsx scripts/probes/prince-ask.ts
```
Expected: leads with a decision, cites the net gap vs ₱50k, references ROAS-vs-breakeven, no metric dump.

- [ ] **Step 4: Commit** `feat(council): /prince persona + 5-stage single-pass + profit anchor (§0,§0b,§3h)`.

**Phase 3 gate:** typecheck + build clean; `/prince` dry-run reads like a senior buyer.

---

## Phase 4 — Staged weekly council (Opus) + wiring

*Spec §0b staged-council (hybrid). Weekly = one cross-examined pass per stage.*

### Task 4.1: Staged orchestrator for the weekly path

**Files:** Modify `lib/council/session.ts` (add `runStagedCouncil(brand, reasons, {model})`, used by the weekly path; keep single-pass `runCouncilSession` for on-demand).

**Interfaces:** Produces `runStagedCouncil` → same persisted `{sessionId, failedPredictionInserts}` as `runCouncilSession`. Internally: Pass 1 → problems (Stage 1, malfunction-first, with confidence); Pass 2 → cross-examine + keep only above-floor/non-NOISE problems, pick data (Stage 2); Pass 3 → evidence (Stage 3); Pass 4 → solutions + synthesis + verdict (Stages 4–5). Each pass is a separate Messages API call whose input includes the prior pass's validated JSON.

- [ ] **Step 1:** Implement the 4-call sequence (each call: system = the relevant stage rules + persona + profit anchor; user = pack + prior-stage output). Reuse `extractJson`/`validateSessionJson` per stage with small per-stage schemas; assemble the final `SessionJson`; persist exactly as `runCouncilSession` does (council_sessions + predictions).
- [ ] **Step 2:** Guard cost: if `pack.malfunctions` is empty AND no problem clears the severity floor after Pass 1, short-circuit to a NULL-RESULT synthesis (one watch item) and skip Passes 2–4 (saves tokens; honors NULL-RESULT LAW).
- [ ] **Step 3:** `npx tsc --noEmit` → clean.
- [ ] **Step 4: Live staged dry-run**

```bash
cat > scripts/probes/staged.ts <<'EOF'
import { runStagedCouncil } from '@/lib/council/session';
(async () => console.log(await runStagedCouncil('BOSS' as any, ['manual staged test'], { model: process.env.COUNCIL_WEEKLY_MODEL || 'claude-opus-5' })))();
EOF
set -a; . ./.env.local; set +a; npx tsx scripts/probes/staged.ts
```
Expected: a session row is written; read it back (journal or a select) — problems classified by type, malfunctions surfaced first, NOISE items only in watchlist.

- [ ] **Step 5: Commit** `feat(council): staged multi-pass weekly council (§0b hybrid)`.

### Task 4.2: Pipeline uses the staged council on the weekly path

**Files:** Modify `lib/council/pipeline.ts` (the `if (weekly && !sessionExistsToday…)` block → call `runStagedCouncil` instead of `runCouncilSession`).

- [ ] **Step 1:** Swap the call; keep the dedup + reasons logic identical.
- [ ] **Step 2:** `npx tsc --noEmit` → clean; build clean.
- [ ] **Step 3: Commit** `feat(council): weekly pipeline runs the staged council (§0b)`.

**Phase 4 gate:** typecheck + build clean; staged dry-run verified.

---

## Phase 5 — Breakdowns (placement / audience / attribution / micro-conversions)

*Spec §3e, §3f, §3g. Live best-effort weekly fetches, parallelized; degrade to omitted.*

### Task 5.1: `breakdowns.ts` — placement + audience + micro-conversions

**Files:** Create `lib/council/breakdowns.ts` + `lib/council/breakdowns.test.ts` (pure aggregation only).

**Interfaces:** Produces `getWeekBreakdowns(weekStart, weekEnd): Promise<{ placement: Row[]; audience: Row[]; funnel: Funnel }>` where `Row = {key,spendCentavos,revenueCentavos,roas,cpp,purchases}`; best-effort (empty on failure). Pure helper `aggregateBreakdown(rows, keyFields)` is unit-tested.

- [ ] **Step 1: Failing test for the pure aggregator** (mirrors the confirmed live probe: FB Reels drag):

```ts
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { aggregateBreakdown } from './breakdowns';
const rows = [
  { publisher_platform:'facebook', platform_position:'feed', spend:'1000', action_values:[{action_type:'omni_purchase',value:'2280'}] },
  { publisher_platform:'facebook', platform_position:'facebook_reels', spend:'1000', action_values:[{action_type:'omni_purchase',value:'1290'}] },
];
test('aggregates by placement + computes ROAS', () => {
  const out = aggregateBreakdown(rows as any, ['publisher_platform','platform_position']);
  const reels = out.find(r => r.key === 'facebook/facebook_reels')!;
  assert.ok(Math.abs(reels.roas - 1.29) < 0.01);
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `aggregateBreakdown` (sum spend×100→centavos, revenue from omni_purchase/purchase action_values×100, roas=rev/spend, cpp, purchases from actions) + `getWeekBreakdowns` doing 3 live `act_/insights` calls (`breakdowns=publisher_platform,platform_position`; `breakdowns=age,gender`; `breakdowns=region`) with `time_range={since:weekStart,until:weekEnd}`, plus a plain call for `funnel` (actions: link_click, landing_page_view, add_to_cart/omni_add_to_cart, initiate_checkout/omni_initiated_checkout, purchase). All wrapped best-effort → `[]`/zeros on error. Reuse the token/version constants from meta-ads.
- [ ] **Step 4:** Run test → PASS. `npx tsc --noEmit` → clean.
- [ ] **Step 5: Live probe** (reuse the confirmed shape): expect FB Feed ~2.28×, FB Reels ~1.29×, 35-44 M strongest, funnel counts non-zero.
- [ ] **Step 6: Commit** `feat(council): breakdowns.ts placement/audience/micro-conv (§3e,§3f,§3g)`.

### Task 5.2: Wire breakdowns into the pack (parallel, best-effort)

**Files:** Modify `lib/council/pack.ts`.

- [ ] **Step 1:** Add `getWeekBreakdowns(weekStart, weekEnd).catch(() => emptyBreakdowns)` to the best-effort `Promise.all` beside `getCampaignStructures`/`getRecentChanges`/`getAdStatuses`; attach to `thisWeek.breakdowns` + `thisWeek.funnel`.
- [ ] **Step 2:** Add to `CouncilPack` type. `npx tsc --noEmit` → clean.
- [ ] **Step 3:** Add placement/audience/funnel prompt rules (§3e–g) to both `session.ts` and `prince.ts` (a placement dragging ROAS → shift/exclude; weak demo → tighten; funnel step leak → name it).
- [ ] **Step 4:** Build clean; extend `pack-week.ts` probe to print breakdowns.
- [ ] **Step 5: Commit** `feat(council): wire breakdowns + prompt rules into pack (§3e-g)`.

**Phase 5 gate:** typecheck + build clean.

---

## Phase 6 — Pacing, day-of-week, daily-pulse ROAS, brief alignment

*Spec §3c, §3d, §5, §2 (cohort alignment).*

### Task 6.1: Pacing / budget utilization

**Files:** Modify `lib/council/pack.ts` (+ `lib/council/pacing.test.ts` for the pure util math).

- [ ] **Step 1: Failing test** for `utilization(avgDailySpend, dailyBudget)` → pct + `underDelivering`(<0.7)/`budgetCapped`(≥0.95) flags.
- [ ] **Step 2:** Implement the pure helper; aggregate `avgDailySpend7` per campaign (CBO) / ad set (ABO) from `thisWeek` spend ÷ delivering days, join to `structure` budgets; attach `thisWeek.pacing`.
- [ ] **Step 3:** Prompt rule (§3c): weak results + low utilization → delivery problem; capped winner → raise budget. Add to both prompts.
- [ ] **Step 4:** test PASS, typecheck clean. **Commit** `feat(council): pacing/budget utilization (§3c)`.

### Task 6.2: Day-of-week rhythm (4-week, capped DIRECTIONAL)

**Files:** Modify `lib/council/pack.ts`.

- [ ] **Step 1:** Over the 4-week context window, aggregate per-weekday cpp/roas/spendShare → `context.dayOfWeek`. Tag the whole block as DIRECTIONAL-max (per §0b) in the prompt rule.
- [ ] **Step 2:** Prompt rule (§3d): rhythm-spotting only, never a cut reason.
- [ ] **Step 3:** typecheck + build clean. **Commit** `feat(council): day-of-week rhythm context (§3d)`.

### Task 6.3: Daily pulse shows yesterday ROAS; brief Mon–Sun cohort

**Files:** Modify `lib/council/brief.ts` (`buildPulse` yesterday block) + `lib/council/pipeline.ts` (pass yesterday revenue) + `fetchCohortThisWeek` (align to the same Mon–Sun as `deriveWeekBounds`).

- [ ] **Step 1:** Thread `yesterday.revenueCentavos` through the pipeline's yesterday scan; in `buildPulse` add a `ROAS X.Xx` line beside the CPP line (guard divide-by-zero).
- [ ] **Step 2:** Point `fetchCohortThisWeek` at `deriveWeekBounds(...).weekStart` so "This week" matches the analysis week.
- [ ] **Step 3:** typecheck + build clean; run `runCouncilPipeline('BOSS')` probe → pulse shows a ROAS line. **Commit** `feat(council): pulse yesterday ROAS + Mon–Sun cohort alignment (§5,§2)`.

**Phase 6 gate:** typecheck + build clean.

---

## Phase 7 — Verification dry-runs (spec §8) + deploy

### Task 7.1: The three required dry-runs

- [ ] **(a) Null-result:** craft `scripts/probes/fixture-healthy.ts` feeding a healthy-week pack (all above breakeven, no malfunctions, nothing above floor) into `runStagedCouncil` (or a pure `synthesize` seam) → assert the briefing says "nothing needs fixing this week" + exactly one watch item; below-floor items in `watchlist`.
- [ ] **(b) Minimum-signal:** feed a NOISE-tier "winner" (₱186 CPP on ₱929 spend) → assert it is NOT in `solutions` as a scale; appears only in `watchlist`.
- [ ] **(c) Profit anchor:** run the live weekly staged dry-run → assert the verdict/synthesis frames the call vs `breakevenRoas`/`targetRoas` + names the ₱50k/day net gap; with economics unset (temporarily blank the row in a scratch brand) → asserts the "no profit anchor" disclaimer.
- [ ] **Commit** `test(council): v2 §8 dry-runs (null-result, min-signal, profit-anchor)`.

### Task 7.2: Ship

- [ ] **Step 1:** `npx tsc --noEmit` && `./node_modules/.bin/next build` clean.
- [ ] **Step 2:** `git push origin main` (Vercel auto-deploys `conex1/bosslabs`).
- [ ] **Step 3:** Post-deploy: trigger `/api/cron/weekly-analysis` once (or wait for Sun 10am) and read the Telegram brief — confirm it leads with the ₱50k/day net gap, cites ROAS-vs-breakeven, classifies problems, surfaces malfunctions first, and does not metric-dump.
- [ ] **Step 4:** Update `docs/ads-council/PRINCE.md` capabilities doc to reflect v2 (economics anchor, 5-stage method, staged council, confidence tiers, breakdowns).

---

## Self-review notes (coverage map)

- §0 persona → 3.4, 3.5 · §0b method/confidence/null-result/malfunction → 3.1–3.4, 4.1 · §2 temporal → 1.1, 1.2, 6.3 · §3a ROAS/AOV → 1.1–1.3 · §3b objective + BUG-1/2/3 → 2.1 · §3c pacing → 6.1 · §3d day-of-week → 6.2 · §3e/f/g breakdowns → 5.1, 5.2 · §3h economics + north star → 0.1–0.3, 1.2, 3.4/3.5 · §5 guardrails (pulse ROAS) → 6.3 · §5a output discipline/severity floor/scaling velocity → 3.4, 3.5 · §8 verification → 7.1. Deterministic tiers + paused-ad rule: untouched by design.
