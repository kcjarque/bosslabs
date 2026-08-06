# Ads Council Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the BossLabs Ads Council — nightly per-ad verdict engine + daily Telegram brief + trigger-based 4-expert LLM council with prediction ledger and mode-gated Meta execution — entirely inside `/admin/ads`.

**Architecture:** Nightly ledgered pipeline: sync last-3-days per-ad metrics → grade every ad with a pure rules engine (windows end at settled day D−3) → append verdict history → compose 12-line brief into the existing daily-summary Telegram → check council triggers → run one Anthropic call per triggered session → resolve ledger predictions. UI only reads stored rows.

**Tech Stack:** Next.js 14 App Router, cloud Supabase (`getSupabase()` from `@/lib/supabase`), Meta Graph API v23.0 (`META_ADS_TOKEN`), Anthropic Messages API via raw fetch (`ANTHROPIC_API_KEY`, model `claude-sonnet-5`), `node:test` via `npx tsx --test` (zero new deps).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-06-ads-council-design.md`. Doctrine (council system prompt source): `docs/ads-council/DOCTRINE.md`.
- BOSS brand only at launch; every table carries `brand text` (`'BOSS'|'CONX'|'LEO'`). Brand from campaign-name prefix: `BOSSLABS` → BOSS, `MEDIA` → CONX, `AHENTE` → LEO.
- Verdict windows end at settled day **D−3** (Meta 72h restatement). The brief's YESTERDAY line is the only preliminary surface.
- Guardrails in code at execution layer, every mode: pauses capped at 20% of trailing-7d daily spend per day; budget changes clamped ±20%/day; never touch LEARNING ads.
- Ground truth (doctrine §1): no verdicts on ads <72h old; banned phrases in advise text: "monitor closely", "consider testing", "keep an eye on".
- Migrations: NEW file `supabase/migrations/0053_ads_council.sql`; apply via Supabase Management API SQL endpoint (editing an applied migration is a silent no-op).
- Existing helpers to reuse, not duplicate: `getSupabase()` (`lib/supabase.ts`), `requireAdmin()`/`getAdminSession()` (`lib/admin-auth.ts`), `verifyCronAuth()` (`lib/cron.ts`), `sendTelegram()` (`lib/telegram.ts`), Graph fetch patterns in `lib/meta-ads.ts` (env: `META_ADS_TOKEN`, `META_GRAPH_VERSION` default `v23.0`, `META_ADS_ACCOUNT_ID` default `118264717761938`).
- Tests: `npx tsx --test tests/council/*.test.ts` — plain `node:test` + `node:assert/strict`.
- Commit after every task. Deploy = `git push origin main` (Vercel auto-deploys; commit author must be kyle@conexmedia.ph — already configured).

---

### Task 1: Migration — council tables

**Files:**
- Create: `supabase/migrations/0053_ads_council.sql`

**Interfaces:**
- Produces: tables `ad_metrics_daily`, `ad_account_priors`, `ad_verdict_history`, `council_settings`, `council_sessions`, `council_predictions`, `council_actions` used by every later task.

- [ ] **Step 1: Write the migration**

```sql
-- 0053_ads_council.sql — Ads Council data spine (spec 2026-08-06).
create table if not exists ad_metrics_daily (
  brand text not null default 'BOSS',
  campaign_id text not null,
  campaign_name text not null default '',
  adset_id text not null default '',
  adset_name text not null default '',
  ad_id text not null,
  ad_name text not null default '',
  date date not null,
  spend_centavos bigint not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  frequency numeric,
  ctr numeric,
  link_ctr numeric,
  cpm numeric,
  link_clicks bigint not null default 0,
  purchases int not null default 0,
  revenue_centavos bigint not null default 0,
  synced_at timestamptz not null default now(),
  primary key (ad_id, date)
);
create index if not exists idx_amd_brand_date on ad_metrics_daily (brand, date);
create index if not exists idx_amd_campaign_date on ad_metrics_daily (campaign_id, date);

create table if not exists ad_account_priors (
  brand text primary key,
  daily_cpp_sigma_pct numeric,
  median_winner_lifespan_days numeric,
  cpp_drift_pct_per_week numeric,
  weekday_multipliers jsonb,
  sample_days int not null default 0,
  computed_at timestamptz not null default now()
);

create table if not exists ad_verdict_history (
  brand text not null default 'BOSS',
  ad_id text not null,
  ad_name text not null default '',
  date date not null,
  verdict text not null check (verdict in ('LEARNING','WINNING','WATCH','LOSER')),
  role text not null check (role in ('PROSPECTOR','CLOSER','HYBRID')),
  days_in_tier int not null default 1,
  changed boolean not null default false,
  degraded boolean not null default false,
  deciding_metrics jsonb not null default '{}'::jsonb,
  headline_advice text not null default '',
  full_interpretation text not null default '',
  tier_flip_condition text not null default '',
  created_at timestamptz not null default now(),
  primary key (ad_id, date)
);
create index if not exists idx_avh_brand_date on ad_verdict_history (brand, date desc);
create index if not exists idx_avh_changed on ad_verdict_history (date desc) where changed;

create table if not exists council_settings (
  brand text primary key,
  mode text not null default 'recommend' check (mode in ('recommend','one_click','autopilot')),
  target_cpp_centavos bigint not null default 50000,
  updated_at timestamptz not null default now()
);
insert into council_settings (brand) values ('BOSS') on conflict do nothing;

create table if not exists council_sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  brand text not null default 'BOSS',
  trigger_reasons text[] not null default '{}',
  data_mode text not null default 'B' check (data_mode in ('A','B')),
  transcript_md text not null default '',
  verdict jsonb not null default '{}'::jsonb,
  model text not null default '',
  input_tokens int, output_tokens int,
  created_at timestamptz not null default now()
);
create index if not exists idx_cs_brand_date on council_sessions (brand, date desc);

create table if not exists council_predictions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  brand text not null default 'BOSS',
  expert text not null check (expert in ('CHARLEY','NICK','BEN','DARA','CHAIR')),
  session_id uuid references council_sessions(id) on delete set null,
  conflict_ref text,
  action_taken boolean not null default false,
  prediction_text text not null,
  metric text not null default '',
  threshold numeric,
  target_id text,            -- ad_id or campaign_id the metric applies to
  deadline date not null,
  weight numeric not null default 1.0,
  outcome text check (outcome in ('hit','miss','push')),
  needs_manual boolean not null default false,
  resolved_date date,
  notes text not null default ''
);
create index if not exists idx_cp_open on council_predictions (brand, deadline) where outcome is null;

create table if not exists council_actions (
  id uuid primary key default gen_random_uuid(),
  date date not null default now()::date,
  brand text not null default 'BOSS',
  session_id uuid references council_sessions(id) on delete set null,
  action_type text not null check (action_type in ('pause_ad','unpause_ad','set_budget')),
  target_id text not null,
  before jsonb not null default '{}'::jsonb,
  after jsonb not null default '{}'::jsonb,
  mode text not null,
  executed_by text not null default 'system',
  result text not null default '',
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Apply to cloud via Management API**

Run (repo root; jq-encode the file to survive quoting):
```bash
set -a && source <(grep -v '^#' .env.local | grep '=' | grep -v '^\s*$') && set +a 2>/dev/null
jq -Rs '{query: .}' < supabase/migrations/0053_ads_council.sql > /tmp/mig53.json
curl -s -o /tmp/mig53.out -w "http=%{http_code}\n" -X POST \
  -H "Authorization: Bearer $SUPABASE_BOSSLABS_TOKEN" -H "content-type: application/json" \
  "https://api.supabase.com/v1/projects/hsbowpbuqlctxeglpqyd/database/query" -d @/tmp/mig53.json
cat /tmp/mig53.out
```
Expected: `http=201` and `[]`.

- [ ] **Step 3: Verify tables exist**

```bash
curl -s -X POST -H "Authorization: Bearer $SUPABASE_BOSSLABS_TOKEN" -H "content-type: application/json" \
  "https://api.supabase.com/v1/projects/hsbowpbuqlctxeglpqyd/database/query" \
  -d '{"query":"select table_name from information_schema.tables where table_name like any(array['"'"'ad_%'"'"','"'"'council_%'"'"']) order by 1"}'
```
Expected: includes all 7 new tables (plus pre-existing `ad_insights_daily`, `ad_spend_daily`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0053_ads_council.sql
git commit -m "council: migration 0053 — metrics, verdicts, sessions, ledger, actions, settings"
```

---

### Task 2: Types + verdict engine (TDD)

**Files:**
- Create: `lib/council/types.ts`
- Create: `lib/council/verdict-engine.ts`
- Test: `tests/council/verdict-engine.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 3–13):

```ts
// lib/council/types.ts
export type Brand = 'BOSS' | 'CONX' | 'LEO';
export type Tier = 'LEARNING' | 'WINNING' | 'WATCH' | 'LOSER';
export type Role = 'PROSPECTOR' | 'CLOSER' | 'HYBRID';
export type Mode = 'recommend' | 'one_click' | 'autopilot';

export type AdDay = {
  date: string;               // YYYY-MM-DD
  spendCentavos: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  ctr: number | null;         // % (all clicks)
  linkCtr: number | null;     // %
  cpm: number | null;         // pesos
  linkClicks: number;
  purchases: number;
  revenueCentavos: number;
};

export type AdSeries = {
  brand: Brand;
  campaignId: string; campaignName: string;
  adsetId: string; adsetName: string;
  adId: string; adName: string;
  days: AdDay[];              // ascending by date; first row = first day with delivery
};

export type CampaignWindow = {
  totalSpend7Centavos: number;      // campaign spend, trailing 7 settled days
  blendedCpp7Centavos: number | null;
};

export type CouncilSettingsRow = { brand: Brand; mode: Mode; targetCppCentavos: number };

export type PriorsRow = {
  brand: Brand;
  dailyCppSigmaPct: number | null;
  medianWinnerLifespanDays: number | null;
  cppDriftPctPerWeek: number | null;
  weekdayMultipliers: Record<string, number> | null;
  sampleDays: number;
};

export type VerdictResult = {
  adId: string; adName: string; brand: Brand;
  date: string;               // grading date (the settled day)
  verdict: Tier; role: Role;
  daysInTier: number; changed: boolean; degraded: boolean;
  decidingMetrics: Record<string, number | null>;
  headline: string;           // ≤90 chars
  interpretation: string;
  tierFlipCondition: string;
};
```

```ts
// lib/council/verdict-engine.ts
export function windowsFor(series: AdSeries, asOf: string): {
  spend7: number; spendPrior7: number;
  purchases7: number; purchasesPrior7: number;
  cpp7: number | null; cppPrior7: number | null;
  freq7: number | null; ctr7: number | null; ctrPrior7: number | null;
  cpm7: number | null; cpmPrior7: number | null;
  lifetimePurchases: number; ageDays: number;
};
export function gradeAd(args: {
  series: AdSeries;
  campaign: CampaignWindow & { campaignSpend7ByAd: Record<string, number>; campaignSpendPrior7ByAd: Record<string, number> };
  settings: CouncilSettingsRow;
  asOf: string;                                   // settled day D-3, YYYY-MM-DD
  prev: { verdict: Tier; daysInTier: number } | null;
  historyDays: number;                            // days of campaign history available
}): VerdictResult;
```

- [ ] **Step 1: Write failing tests** — one per tier boundary. Create `tests/council/verdict-engine.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAd } from '../../lib/council/verdict-engine';
import type { AdSeries, AdDay } from '../../lib/council/types';

const SETTINGS = { brand: 'BOSS' as const, mode: 'recommend' as const, targetCppCentavos: 50000 };

function day(date: string, over: Partial<AdDay> = {}): AdDay {
  return { date, spendCentavos: 100000, impressions: 10000, reach: 8000, frequency: 1.2,
    ctr: 2.0, linkCtr: 1.2, cpm: 100, linkClicks: 120, purchases: 2, revenueCentavos: 199800, ...over };
}
/** n days ending at endDate (inclusive), ascending. */
function daysEnding(endDate: string, n: number, over: (i: number) => Partial<AdDay> = () => ({})): AdDay[] {
  const end = new Date(endDate + 'T00:00:00Z').getTime();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end - (n - 1 - i) * 86400000).toISOString().slice(0, 10);
    return day(d, over(i));
  });
}
function series(days: AdDay[], over: Partial<AdSeries> = {}): AdSeries {
  return { brand: 'BOSS', campaignId: 'c1', campaignName: 'BOSSLABS AI | SALES',
    adsetId: 's1', adsetName: 'set', adId: 'a1', adName: 'Ads 14_24hrs', days, ...over };
}
function campaignFor(s: AdSeries, extraSpend7 = 0) {
  const spend7 = s.days.slice(-7).reduce((t, d) => t + d.spendCentavos, 0);
  return {
    totalSpend7Centavos: spend7 + extraSpend7,
    blendedCpp7Centavos: 45000,
    campaignSpend7ByAd: { [s.adId]: spend7, other: extraSpend7 },
    campaignSpendPrior7ByAd: { [s.adId]: s.days.slice(-14, -7).reduce((t, d) => t + d.spendCentavos, 0), other: extraSpend7 },
  };
}
const ASOF = '2026-08-03';
const BASE = { settings: SETTINGS, asOf: ASOF, prev: null, historyDays: 60 };

test('fresh ad (<72h) is LEARNING', () => {
  const s = series(daysEnding(ASOF, 2));
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s) });
  assert.equal(v.verdict, 'LEARNING');
});

test('<10 lifetime purchases is LEARNING with graduation advise', () => {
  const s = series(daysEnding(ASOF, 10, () => ({ purchases: 0 })));
  s.days[9] = { ...s.days[9], purchases: 4 };
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s) });
  assert.equal(v.verdict, 'LEARNING');
  assert.match(v.headline, /purchase/i);
});

test('healthy prospector under target CPP is WINNING', () => {
  // 2 purchases/day @ ₱1,000 spend/day → CPP ₱500 = target; freq 1.2 <1.3 prospector
  const s = series(daysEnding(ASOF, 20));
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000) });
  assert.equal(v.verdict, 'WINNING');
  assert.equal(v.role, 'PROSPECTOR');
});

test('single deterioration signal (CPP +15%) is WATCH, never pause language', () => {
  // prior 7d: 2 buys/day; trailing 7d: same spend, fewer buys → CPP +~15%
  const s = series(daysEnding(ASOF, 20, (i) => (i >= 13 ? { purchases: i % 2 === 0 ? 2 : 1 } : {})));
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000) });
  assert.equal(v.verdict, 'WATCH');
  assert.doesNotMatch(v.headline, /pause/i);
});

test('full fatigue (CPP +25%, share down, ctr falling) is LOSER', () => {
  const s = series(daysEnding(ASOF, 20, (i) => (i >= 13
    ? { purchases: 1, spendCentavos: 60000, ctr: 1.0, frequency: 2.6 } : {})));
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 800000) });
  assert.equal(v.verdict, 'LOSER');
});

test('zero purchases after 3x target spend post-learning is LOSER', () => {
  const s = series(daysEnding(ASOF, 10, () => ({ purchases: 0, spendCentavos: 20000 })));
  // lifetime spend ₱2,000*10... ensure > 3×₱500 = ₱1,500 ✓ and >72h old ✓ — but <10 purchases…
  // per doctrine §5.2 zero-purchase LOSER overrides the <10-purchase LEARNING gate once
  // spend > 3×target: it graduated by burning budget.
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000) });
  assert.equal(v.verdict, 'LOSER');
});

test('freq ≥2.0 with below-avg CPP is CLOSER and WINNING (not misgraded)', () => {
  const s = series(daysEnding(ASOF, 20, () => ({ frequency: 2.4, purchases: 3 }))); // CPP ₱333 < blended ₱450
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000) });
  assert.equal(v.role, 'CLOSER');
  assert.equal(v.verdict, 'WINNING');
});

test('under 14 days of campaign history → degraded, tier LEARNING only', () => {
  const s = series(daysEnding(ASOF, 20));
  const v = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000), historyDays: 5 });
  assert.equal(v.degraded, true);
  assert.equal(v.verdict, 'LEARNING');
});

test('daysInTier increments when verdict unchanged, changed flag on flip', () => {
  const s = series(daysEnding(ASOF, 20));
  const stay = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000), prev: { verdict: 'WINNING', daysInTier: 4 } });
  assert.equal(stay.daysInTier, 5);
  assert.equal(stay.changed, false);
  const flip = gradeAd({ ...BASE, series: s, campaign: campaignFor(s, 400000), prev: { verdict: 'WATCH', daysInTier: 2 } });
  assert.equal(flip.changed, true);
  assert.equal(flip.daysInTier, 1);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx tsx --test tests/council/verdict-engine.test.ts`
Expected: FAIL — cannot find module `lib/council/verdict-engine`.

- [ ] **Step 3: Write `lib/council/types.ts`** — exactly the Interfaces block above.

- [ ] **Step 4: Write `lib/council/verdict-engine.ts`**

```ts
/** Ads Council verdict engine — doctrine §5.2, pure + deterministic.
 *  Windows end at the settled day (asOf = D-3); rows after asOf are ignored. */
import type { AdSeries, CampaignWindow, CouncilSettingsRow, Tier, Role, VerdictResult } from './types';

const MS_DAY = 86400000;
const peso = (c: number) => `₱${Math.round(c / 100).toLocaleString()}`;

function slice7(series: AdSeries, asOf: string) {
  const upTo = series.days.filter((d) => d.date <= asOf);
  return { t7: upTo.slice(-7), p7: upTo.slice(-14, -7), upTo };
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

export function windowsFor(series: AdSeries, asOf: string) {
  const { t7, p7, upTo } = slice7(series, asOf);
  const spend7 = sum(t7.map((d) => d.spendCentavos));
  const spendPrior7 = sum(p7.map((d) => d.spendCentavos));
  const purchases7 = sum(t7.map((d) => d.purchases));
  const purchasesPrior7 = sum(p7.map((d) => d.purchases));
  const first = upTo[0]?.date;
  const ageDays = first ? Math.floor((Date.parse(asOf) - Date.parse(first)) / MS_DAY) + 1 : 0;
  return {
    spend7, spendPrior7, purchases7, purchasesPrior7,
    cpp7: purchases7 > 0 ? spend7 / purchases7 : null,
    cppPrior7: purchasesPrior7 > 0 ? spendPrior7 / purchasesPrior7 : null,
    freq7: avg(t7.map((d) => d.frequency).filter((x): x is number => x != null)),
    ctr7: avg(t7.map((d) => d.ctr).filter((x): x is number => x != null)),
    ctrPrior7: avg(p7.map((d) => d.ctr).filter((x): x is number => x != null)),
    cpm7: avg(t7.map((d) => d.cpm).filter((x): x is number => x != null)),
    cpmPrior7: avg(p7.map((d) => d.cpm).filter((x): x is number => x != null)),
    lifetimePurchases: sum(upTo.map((d) => d.purchases)),
    lifetimeSpend: sum(upTo.map((d) => d.spendCentavos)),
    ageDays,
  };
}

function roleOf(freq7: number | null): Role {
  if (freq7 == null) return 'HYBRID';
  if (freq7 < 1.3) return 'PROSPECTOR';
  if (freq7 >= 2.0) return 'CLOSER';
  return 'HYBRID';
}

export function gradeAd(args: {
  series: AdSeries;
  campaign: CampaignWindow & { campaignSpend7ByAd: Record<string, number>; campaignSpendPrior7ByAd: Record<string, number> };
  settings: CouncilSettingsRow;
  asOf: string;
  prev: { verdict: Tier; daysInTier: number } | null;
  historyDays: number;
}): VerdictResult {
  const { series, campaign, settings, asOf, prev, historyDays } = args;
  const w = windowsFor(series, asOf);
  const target = settings.targetCppCentavos;
  const role = roleOf(w.freq7);

  const totalSpend7 = Math.max(1, Object.values(campaign.campaignSpend7ByAd).reduce((a, b) => a + b, 0));
  const totalPrior7 = Math.max(1, Object.values(campaign.campaignSpendPrior7ByAd).reduce((a, b) => a + b, 0));
  const share7 = w.spend7 / totalSpend7;
  const sharePrior7 = (campaign.campaignSpendPrior7ByAd[series.adId] ?? 0) / totalPrior7;
  const shareDelta = sharePrior7 > 0 ? (share7 - sharePrior7) / sharePrior7 : 0;

  const cppDeltaPct = w.cpp7 != null && w.cppPrior7 != null && w.cppPrior7 > 0
    ? ((w.cpp7 - w.cppPrior7) / w.cppPrior7) * 100 : null;
  const ctrFalling = w.ctr7 != null && w.ctrPrior7 != null && w.ctr7 < w.ctrPrior7 * 0.95;
  const cpmSpiking = w.cpm7 != null && w.cpmPrior7 != null && w.cpm7 > w.cpmPrior7 * 1.25 && !ctrFalling;

  const deciding: Record<string, number | null> = {
    cpp_7d: w.cpp7 != null ? Math.round(w.cpp7) : null,
    cpp_prior_7d: w.cppPrior7 != null ? Math.round(w.cppPrior7) : null,
    cpp_delta_pct: cppDeltaPct != null ? Math.round(cppDeltaPct) : null,
    spend_share_7d: Number(share7.toFixed(3)),
    spend_share_delta: Number(shareDelta.toFixed(3)),
    freq_7d: w.freq7 != null ? Number(w.freq7.toFixed(2)) : null,
    ctr_7d: w.ctr7 != null ? Number(w.ctr7.toFixed(2)) : null,
    lifetime_purchases: w.lifetimePurchases,
  };

  const make = (verdict: Tier, degraded: boolean, headline: string, interpretation: string, flip: string): VerdictResult => ({
    adId: series.adId, adName: series.adName, brand: series.brand, date: asOf,
    verdict, role, degraded,
    daysInTier: prev && prev.verdict === verdict ? prev.daysInTier + 1 : 1,
    changed: prev != null && prev.verdict !== verdict,
    decidingMetrics: deciding,
    headline: headline.slice(0, 90), interpretation, tierFlipCondition: flip,
  });

  // Data-mode guard (§4.1): tiers need trailing windows.
  if (historyDays < 14) {
    return make('LEARNING', true,
      `Degraded data — ${historyDays}d of history; needs 14d before real tiers.`,
      `Only ${historyDays} days of campaign history are synced. The engine grades on trailing 7d vs prior 7d windows, so real tiers unlock at 14 days. Run/await backfill.`,
      `Graduates when campaign history ≥14 days.`);
  }
  // LOSER zero-purchase check outranks the <10-purchase LEARNING gate: an ad
  // that burned 3× target with zero buys graduated by burning budget (§5.2).
  if (w.ageDays > 3 && w.lifetimePurchases === 0 && (w as { lifetimeSpend: number }).lifetimeSpend > 3 * target) {
    return make('LOSER', false,
      `Zero buyers after ${peso((w as { lifetimeSpend: number }).lifetimeSpend)} — kill and replace.`,
      `Spent ${peso((w as { lifetimeSpend: number }).lifetimeSpend)} (>3× target CPP ${peso(target)}) with zero purchases post-learning. Doctrine §5.2 zero-purchase rule. Respect the 20%-of-daily-spend subtraction cap when pausing; replace with a concept covering the same slot.`,
      `Already terminal — any purchase before pause would re-grade next run.`);
  }
  // LEARNING (§5.2 first match)
  if (w.ageDays <= 3 || w.lifetimePurchases < 10) {
    const need = Math.max(0, 10 - w.lifetimePurchases);
    return make('LEARNING', false,
      `In learning — needs ${need > 0 ? `${need} more purchase${need === 1 ? '' : 's'}` : `${4 - w.ageDays} more day(s)`} to graduate.`,
      `Ad is ${w.ageDays} day(s) old with ${w.lifetimePurchases} lifetime purchases. No verdict permitted under 72h/10-purchase gate (Ground Truth). It graduates at 10 purchases and >72h.`,
      `Graduates when lifetime purchases ≥10 and age >72h.`);
  }

  // LOSER — full §7.6 fatigue (approximated over settled windows) or red-flag.
  const fatigued = cppDeltaPct != null && cppDeltaPct >= 20 && shareDelta < 0 && (ctrFalling || (w.freq7 ?? 0) > (role === 'CLOSER' ? 3.5 : 1.8));
  const redFlag = share7 >= 0.2 && w.cpp7 != null && campaign.blendedCpp7Centavos != null && w.cpp7 > campaign.blendedCpp7Centavos * 1.3;
  if (fatigued || redFlag) {
    return make('LOSER', false,
      fatigued
        ? `Fatigued: CPP +${Math.round(cppDeltaPct!)}%, share ${Math.round(shareDelta * 100)}% — pause within cap.`
        : `Top-spend ad at ${Math.round((w.cpp7! / campaign.blendedCpp7Centavos!) * 100)}% of blended CPP — wrong crowd.`,
      fatigued
        ? `CPP ${peso(w.cppPrior7!)} → ${peso(w.cpp7!)} (+${Math.round(cppDeltaPct!)}%), spend share falling, engagement deteriorating — the full fatigue definition (§7.6). Pause respecting the 20%-of-daily-spend cap and replace the slot.`
        : `Charley's red flag: the machine keeps feeding it (share ${Math.round(share7 * 100)}%) while CPP runs ${peso(w.cpp7!)} vs blended ${peso(campaign.blendedCpp7Centavos!)}. It is buying the wrong crowd. Pause within the 20% cap.`,
      `Re-grades WINNING if CPP_7d ≤ ${peso(target)} for 3 consecutive settled days.`);
  }

  // WATCH — exactly one deterioration signal.
  const signals: string[] = [];
  if (cppDeltaPct != null && cppDeltaPct >= 10 && cppDeltaPct < 20) signals.push(`CPP +${Math.round(cppDeltaPct)}% this week`);
  if (shareDelta <= -0.2) signals.push(`spend share down ${Math.round(-shareDelta * 100)}% — Andromeda cooling on it`);
  if ((w.freq7 ?? 0) > (w.ctrPrior7 != null && ctrFalling ? 0 : Infinity)) { /* freq-rising uses ctrFalling combined below */ }
  if (ctrFalling && w.freq7 != null && w.freq7 >= 1.5 && role !== 'CLOSER') signals.push(`frequency ${w.freq7.toFixed(1)} rising while CTR falls`);
  if (cpmSpiking) signals.push(`CPM +${Math.round(((w.cpm7! - w.cpmPrior7!) / w.cpmPrior7!) * 100)}% on flat CTR`);
  if (signals.length > 0) {
    return make('WATCH', false,
      `${signals[0]}. LOSER if the trend holds; do NOT pause on one signal.`,
      `One deterioration signal: ${signals.join('; ')}. One signal is early warning, not actionable — pausing a WATCH ad is a protocol violation (§5.2). Threshold to LOSER: CPP ≥ ${peso(Math.round((w.cppPrior7 ?? target) * 1.2))} sustained 3 days with share still falling.`,
      `Becomes LOSER if CPP_7d ≥ +20% vs prior AND share declining for 3 consecutive settled days.`);
  }

  // WINNING
  const jobLine = role === 'PROSPECTOR' ? 'Prospecting engine' : role === 'CLOSER' ? 'Closer doing closer work' : 'Hybrid workhorse';
  return make('WINNING', false,
    `${jobLine} at ${w.cpp7 != null ? peso(w.cpp7) : '—'} CPP. Do not touch.`,
    `7d CPP ${w.cpp7 != null ? peso(w.cpp7) : '—'} ≤ target ${peso(target)}, spend share ${Math.round(share7 * 100)}% ${shareDelta >= 0 ? 'rising' : 'stable'}, ${role.toLowerCase()} metrics healthy. Demotes to WATCH on any single deterioration signal (CPP +10%, share −20%, freq↑/CTR↓, CPM +25%).`,
    `Demotes to WATCH if spend share drops >20% or CPP rises >10% week-over-week.`);
}
```

- [ ] **Step 5: Run tests until green**

Run: `npx tsx --test tests/council/verdict-engine.test.ts`
Expected: 9 passing. Iterate on thresholds if a boundary test fails — the tests are the §5.2 contract; fix the engine, not the tests.

- [ ] **Step 6: Commit**

```bash
git add lib/council/types.ts lib/council/verdict-engine.ts tests/council/verdict-engine.test.ts
git commit -m "council: pure verdict engine + tier boundary tests (doctrine §5.2)"
```

---

### Task 3: Meta sync + backfill

**Files:**
- Create: `lib/council/meta-sync.ts`
- Create: `app/api/admin/council/backfill/route.ts`

**Interfaces:**
- Consumes: `META_ADS_TOKEN`, `META_GRAPH_VERSION` (default `v23.0`), `META_ADS_ACCOUNT_ID` (default `118264717761938`) — same envs as `lib/meta-ads.ts`.
- Produces: `syncAdMetricsDaily(opts: { since: string; until: string }): Promise<{ rows: number; ads: number }>` — upserts `ad_metrics_daily`; `brandFromCampaignName(name: string): Brand | null`.

- [ ] **Step 1: Write `lib/council/meta-sync.ts`**

```ts
/** Per-ad daily insights → ad_metrics_daily. Backfill + nightly incremental
 *  share this one function; (ad_id,date) upsert makes it idempotent. */
import { getSupabase } from '@/lib/supabase';
import type { Brand } from './types';

const GRAPH = process.env.META_GRAPH_VERSION || 'v23.0';
const ACCOUNT = process.env.META_ADS_ACCOUNT_ID || '118264717761938';

export function brandFromCampaignName(name: string): Brand | null {
  const up = name.toUpperCase();
  if (up.startsWith('BOSSLABS')) return 'BOSS';
  if (up.startsWith('MEDIA') || up.startsWith('CONEX')) return 'CONX';
  if (up.startsWith('AHENTE') || up.startsWith('LEO')) return 'LEO';
  return null;
}

type InsightRow = {
  date_start: string; campaign_id: string; campaign_name: string;
  adset_id: string; adset_name: string; ad_id: string; ad_name: string;
  spend?: string; impressions?: string; reach?: string; frequency?: string;
  ctr?: string; inline_link_click_ctr?: string; cpm?: string; inline_link_clicks?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
};

function purchasesOf(r: InsightRow): number {
  const a = r.actions ?? [];
  const pick = (t: string) => a.find((x) => x.action_type === t)?.value;
  const v = pick('omni_purchase') ?? pick('purchase') ?? pick('offsite_conversion.fb_pixel_purchase');
  return v ? Math.round(Number(v)) : 0;
}
function revenueOf(r: InsightRow): number {
  const a = r.action_values ?? [];
  const pick = (t: string) => a.find((x) => x.action_type === t)?.value;
  const v = pick('omni_purchase') ?? pick('purchase') ?? pick('offsite_conversion.fb_pixel_purchase');
  return v ? Math.round(Number(v) * 100) : 0;
}

/** Pull ad-level daily insights for [since, until] (YYYY-MM-DD, inclusive) and upsert. */
export async function syncAdMetricsDaily(opts: { since: string; until: string }): Promise<{ rows: number; ads: number }> {
  const token = process.env.META_ADS_TOKEN;
  if (!token) throw new Error('META_ADS_TOKEN not set');
  const fields = [
    'date_start', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
    'spend', 'impressions', 'reach', 'frequency', 'ctr', 'inline_link_click_ctr', 'cpm',
    'inline_link_clicks', 'actions', 'action_values',
  ].join(',');
  let url: string | null =
    `https://graph.facebook.com/${GRAPH}/act_${ACCOUNT}/insights` +
    `?level=ad&time_increment=1&limit=500&fields=${fields}` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since: opts.since, until: opts.until }))}` +
    `&access_token=${token}`;
  const rows: Record<string, unknown>[] = [];
  const adIds = new Set<string>();
  while (url) {
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json()) as { data?: InsightRow[]; paging?: { next?: string }; error?: { message: string } };
    if (json.error) throw new Error(`Meta insights: ${json.error.message}`);
    for (const r of json.data ?? []) {
      const brand = brandFromCampaignName(r.campaign_name ?? '');
      if (brand !== 'BOSS') continue; // launch scope: BOSS only (spec decision 2)
      adIds.add(r.ad_id);
      rows.push({
        brand, campaign_id: r.campaign_id, campaign_name: r.campaign_name,
        adset_id: r.adset_id ?? '', adset_name: r.adset_name ?? '',
        ad_id: r.ad_id, ad_name: r.ad_name ?? '', date: r.date_start,
        spend_centavos: Math.round(Number(r.spend ?? 0) * 100),
        impressions: Number(r.impressions ?? 0), reach: Number(r.reach ?? 0),
        frequency: r.frequency != null ? Number(r.frequency) : null,
        ctr: r.ctr != null ? Number(r.ctr) : null,
        link_ctr: r.inline_link_click_ctr != null ? Number(r.inline_link_click_ctr) : null,
        cpm: r.cpm != null ? Number(r.cpm) : null,
        link_clicks: Number(r.inline_link_clicks ?? 0),
        purchases: purchasesOf(r), revenue_centavos: revenueOf(r),
        synced_at: new Date().toISOString(),
      });
    }
    url = json.paging?.next ?? null;
  }
  const sb = getSupabase();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from('ad_metrics_daily').upsert(rows.slice(i, i + 500), { onConflict: 'ad_id,date' });
    if (error) throw new Error(`ad_metrics_daily upsert: ${error.message}`);
  }
  return { rows: rows.length, ads: adIds.size };
}
```

- [ ] **Step 2: Write the backfill route** `app/api/admin/council/backfill/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { syncAdMetricsDaily } from '@/lib/council/meta-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** POST { since?: 'YYYY-MM-DD' } — full-history backfill in 30-day chunks.
 *  Default since: 2026-05-01 (before first BOSSLABS spend). Re-runnable. */
export async function POST(req: Request) {
  requireAdmin();
  const body = (await req.json().catch(() => ({}))) as { since?: string };
  const since = body.since ?? '2026-05-01';
  const today = new Date().toISOString().slice(0, 10);
  const chunks: { since: string; until: string }[] = [];
  for (let t = Date.parse(since); t <= Date.parse(today); t += 30 * 86400000) {
    const u = Math.min(t + 29 * 86400000, Date.parse(today));
    chunks.push({ since: new Date(t).toISOString().slice(0, 10), until: new Date(u).toISOString().slice(0, 10) });
  }
  const out: { chunk: string; rows: number; ads: number }[] = [];
  for (const c of chunks) {
    const r = await syncAdMetricsDaily(c);
    out.push({ chunk: `${c.since}..${c.until}`, ...r });
  }
  return NextResponse.json({ ok: true, chunks: out });
}
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → exit 0.

- [ ] **Step 4: Run the backfill against prod data (local dev server on :3099 + admin cookie)**

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:3099/api/admin/council/backfill -H "content-type: application/json" -d '{}'
```
Expected: `{"ok":true,"chunks":[...]}` with rows>0. Then verify depth:
```bash
curl -s -X POST -H "Authorization: Bearer $SUPABASE_BOSSLABS_TOKEN" -H "content-type: application/json" \
  "https://api.supabase.com/v1/projects/hsbowpbuqlctxeglpqyd/database/query" \
  -d '{"query":"select count(*) as rows, count(distinct ad_id) as ads, min(date), max(date) from ad_metrics_daily"}'
```
Expected: ≥30 distinct dates (Mode B threshold well cleared).

- [ ] **Step 5: Commit**

```bash
git add lib/council/meta-sync.ts app/api/admin/council/backfill/route.ts
git commit -m "council: per-ad daily insights sync + full-history backfill route"
```

---

### Task 4: DB access layer for council rows

**Files:**
- Create: `lib/council/db.ts`

**Interfaces:**
- Produces (used by pipeline, pack, UI):

```ts
export async function getAdSeries(brand: Brand, sinceDays?: number): Promise<AdSeries[]>;      // grouped, days ascending
export async function getLatestVerdicts(brand: Brand): Promise<VerdictResult[]>;              // newest row per ad
export async function getVerdictHistory(adId: string, limit?: number): Promise<VerdictResult[]>;
export async function saveVerdicts(rows: VerdictResult[]): Promise<void>;                     // upsert (ad_id,date)
export async function getCouncilSettings(brand: Brand): Promise<CouncilSettingsRow>;
export async function saveCouncilSettings(row: CouncilSettingsRow): Promise<void>;
export async function getPriors(brand: Brand): Promise<PriorsRow | null>;
export async function savePriors(row: PriorsRow): Promise<void>;
export async function pipelineRanToday(brand: Brand, dateManila: string): Promise<boolean>;   // any ad_verdict_history row for date
```

- [ ] **Step 1: Implement** — follow `lib/db.ts` conventions (snake_case rows, `rowTo*` converters, `getSupabase()`); paginate `ad_metrics_daily` reads with `.range()` loops (PostgREST 1000-row cap — same pattern as `getSignups`). `getAdSeries` selects rows `date >= today - sinceDays` (default 120), orders by `ad_id, date`, groups in JS.

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → exit 0.

- [ ] **Step 3: Commit** — `git add lib/council/db.ts && git commit -m "council: db access layer"`

---

### Task 5: Priors (TDD light)

**Files:**
- Create: `lib/council/priors.ts`
- Test: `tests/council/priors.test.ts`

**Interfaces:**
- Produces: `computePriors(brand: Brand, series: AdSeries[]): PriorsRow` (pure) and `refreshPriors(brand: Brand): Promise<PriorsRow>` (loads series via `getAdSeries`, saves via `savePriors`).

- [ ] **Step 1: Failing test** — `tests/council/priors.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { computePriors } from '../../lib/council/priors';
// build 30 days of synthetic series where campaign CPP alternates ₱400/₱600 →
// sigma must be >0 and weekday multipliers must have 7 keys.
```
Full test body: construct two `AdSeries` with `daysEnding`-style helper (copy the helper from Task 2's test file — do not import across test files), assert `sampleDays === 30`, `dailyCppSigmaPct! > 0`, `Object.keys(weekdayMultipliers!).length === 7`.

- [ ] **Step 2: Implement `computePriors`** — daily campaign CPP list (sum spend / sum purchases per date, skip zero-purchase days); `dailyCppSigmaPct` = stddev/mean × 100; `weekdayMultipliers` = mean CPP per weekday ÷ overall mean (keys `'0'..'6'`, UTC+8 weekday); `medianWinnerLifespanDays` = median span between an ad's first and last date with spend>0 among ads with lifetime purchases ≥10; `cppDriftPctPerWeek` = linear-regression slope of daily CPP × 7 ÷ mean × 100. Return nulls when <14 sample days.

- [ ] **Step 3: Green** — `npx tsx --test tests/council/priors.test.ts` → PASS.

- [ ] **Step 4: Commit** — `git add lib/council/priors.ts tests/council/priors.test.ts && git commit -m "council: account priors (sigma, weekday, winner lifespan, drift)"`

---

### Task 6: Brief builder + triggers (TDD)

**Files:**
- Create: `lib/council/brief.ts`
- Create: `lib/council/triggers.ts`
- Test: `tests/council/brief.test.ts`

**Interfaces:**
- Produces:

```ts
// brief.ts — pure. yesterday = preliminary numbers; verdicts = today's graded rows.
export function buildBrief(args: {
  brand: Brand; dateManila: string;
  yesterday: { spendCentavos: number; purchases: number } | null;
  avg7Cpp: number | null;
  dayQuality: 'GOOD DAY' | 'NORMAL' | 'SOFT DAY' | 'RED FLAG' | 'NO DATA';
  verdicts: VerdictResult[];
  cohort: { buyers: number; showUpPct: number | null; applications: number } | null;
  chairNote: string; nextLine: string;
}): string;                       // ≤12 lines, HTML-safe for Telegram
export function dayQualityFor(yCpp: number | null, avg7Cpp: number | null, priors: PriorsRow | null):
  'GOOD DAY' | 'NORMAL' | 'SOFT DAY' | 'RED FLAG' | 'NO DATA';

// triggers.ts — pure.
export function detectTriggers(args: {
  todayVerdicts: VerdictResult[];
  blendedCppByDay: { date: string; cpp: number | null }[]; // last 3 settled days
  targetCppCentavos: number;
  missResolvedToday: boolean;
  windowClosedToday: boolean;
  isMondayManila: boolean;
}): string[];                     // empty = council not convened
```

- [ ] **Step 1: Failing tests** — brief renders ≤12 lines, contains `preliminary`, MOVERS shows only `changed` rows and says `No tier changes — roster stable.` when none; `dayQualityFor` returns NORMAL inside 1σ, SOFT beyond 1σ, RED FLAG beyond 2σ, NO DATA on nulls; `detectTriggers` fires on: any LOSER with `changed`, ≥2 WATCH `changed`, 3/3 days CPP>target, MISS day, window close, Monday — and stays empty otherwise.

- [ ] **Step 2: Implement both.** Brief shape exactly doctrine §5.3 (=== BOSS DAILY BRIEF === … NEXT:). Quality line only breaches on >1σ per priors — pass priors σ through `dayQualityFor`.

- [ ] **Step 3: Green** — `npx tsx --test tests/council/brief.test.ts` → PASS.

- [ ] **Step 4: Commit** — `git add lib/council/brief.ts lib/council/triggers.ts tests/council/brief.test.ts && git commit -m "council: daily brief builder + trigger detection"`

---

### Task 7: Ledger (resolution + weights)

**Files:**
- Create: `lib/council/ledger.ts`
- Test: `tests/council/ledger.test.ts`

**Interfaces:**
- Produces:

```ts
export function scoreOf(outcome: 'hit' | 'miss' | 'push', weight: number): number;      // +1/-1/0 × weight
export function credibilityWeight(scores: number[]): number;                            // 1 + sum*0.1 clamped [0.5, 2.0]
export async function resolveDuePredictions(brand: Brand, asOfSettled: string): Promise<{ resolved: number; manual: number }>;
export async function getExpertWeights(brand: Brand): Promise<Record<'CHARLEY'|'NICK'|'BEN'|'DARA'|'CHAIR', number>>;
```

- [ ] **Step 1: Failing tests** for `scoreOf` + `credibilityWeight` (clamps at 0.5/2.0; empty → 1.0).
- [ ] **Step 2: Implement.** `resolveDuePredictions`: predictions with `outcome is null and deadline <= asOfSettled`; machine-checkable metrics = `cpp_7d` (ad, via `windowsFor`), `campaign_cpp_7d`, `spend_share_7d`; compare against `threshold` with direction inferred from `prediction_text` containing `≤|<|under|below` vs `≥|>|over|above` — if neither parses, mark `needs_manual=true` and count as manual. HIT/MISS write `outcome` + `resolved_date`.
- [ ] **Step 3: Green + commit** — `git add lib/council/ledger.ts tests/council/ledger.test.ts && git commit -m "council: prediction ledger resolution + credibility weights"`

---

### Task 8: Cohorts + council data pack

**Files:**
- Create: `lib/council/pack.ts`

**Interfaces:**
- Consumes: `getSignups()` from `@/lib/db`, `sumWebinarIncomeCentavos` (`@/lib/retreat-crm`), `sumDfyIncomeCentavos` (`@/lib/dfy-crm`), `getAdSeries`, `getPriors`, `getCouncilSettings`, `getLatestVerdicts`, `getExpertWeights`, open predictions query, last session verdict.
- Produces: `assemblePack(brand: Brand, asOfSettled: string): Promise<CouncilPack>` where

```ts
export type CouncilPack = {
  brand: Brand; asOf: string; dataMode: 'A' | 'B';
  ads: Array<{ adId: string; adName: string; role: Role; verdict: Tier; daysInTier: number;
    windows: ReturnType<typeof windowsFor>; last14: AdDay[] }>;
  campaign: { totalSpend7: number; blendedCpp7: number | null; blendedCppPrior7: number | null;
    daysSinceLastCreativeLaunch: number | null };
  cohorts: Array<{ weekStart: string; buyers: number; showUpPct: number | null;
    applications: number; frontRevenueCentavos: number; adSpendCentavos: number;
    cohortProfitCentavos: number | null }>;   // last 6 weeks; attendance null-safe
  priors: PriorsRow | null;
  weights: Record<'CHARLEY'|'NICK'|'BEN'|'DARA'|'CHAIR', number>;
  openPredictions: Array<{ expert: string; text: string; deadline: string }>;
  lastVerdict: { action: string; killSwitch: string; date: string } | null;
  settings: CouncilSettingsRow;
};
```

- [ ] **Step 1: Implement.** Cohorts: group paid/attended signups by ISO week of payment day (`metadata.confirmationSent` fallback `createdAt`), Manila; showUpPct = attended/(paid+attended) per week only when any `attended` rows exist that week, else null; ad spend per week from `ad_metrics_daily`; CP = front revenue (amount + confirmed OTO, same math as `app/admin/page.tsx` `totalPaidCentavos`) + attributed back-end (0 until retreat/dfy rows carry cohort linkage — emit null CP with note rather than fake number). `dataMode`: 'B' when ≥14 distinct settled dates in `ad_metrics_daily`, else 'A'.
- [ ] **Step 2: Typecheck + commit** — `git add lib/council/pack.ts && git commit -m "council: data pack assembly (windows, cohorts, priors, weights)"`

---

### Task 9: Council session runner (Anthropic)

**Files:**
- Create: `lib/council/session.ts`
- Create: `app/api/admin/council/run/route.ts`

**Interfaces:**
- Consumes: `assemblePack`, `docs/ads-council/DOCTRINE.md` (read at runtime via `fs.readFileSync(path.join(process.cwd(), 'docs/ads-council/DOCTRINE.md'))`), `ANTHROPIC_API_KEY`.
- Produces: `runCouncilSession(brand: Brand, triggerReasons: string[]): Promise<{ sessionId: string }>` — stores `council_sessions` + inserts predictions.

- [ ] **Step 1: Implement `lib/council/session.ts`**

```ts
import { readFileSync } from 'fs';
import path from 'path';
import { getSupabase } from '@/lib/supabase';
import { assemblePack } from './pack';
import type { Brand } from './types';

const MODEL = process.env.COUNCIL_MODEL || 'claude-sonnet-5';

type SessionJson = {
  snapshot: string[];
  floor: Array<{ expert: 'CHARLEY'|'NICK'|'BEN'|'DARA'; read: string; diagnosis: string;
    action: string; prediction: { text: string; metric: string; threshold: number | null;
    target_id: string | null; deadline_days: number }; confidence: 'High'|'Medium'|'Low' }>;
  cross_examination: string[];
  disagreement: string;
  verdict: { action: string; why_it_wins: string; what_it_costs: string;
    kill_switch: { text: string; metric: string; threshold: number | null; target_id: string | null; deadline_days: number };
    dissent_on_record: string; also_cleared: string[] };
  transcript_md: string;
};

export async function runCouncilSession(brand: Brand, triggerReasons: string[]): Promise<{ sessionId: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const pack = await assemblePack(brand, settledDay());
  const doctrine = readFileSync(path.join(process.cwd(), 'docs/ads-council/DOCTRINE.md'), 'utf8');
  const system = `${doctrine}\n\n=== RUNTIME RULES ===\nYou are the full council + Chair. Data mode: ${pack.dataMode}. ${pack.dataMode === 'A' ? 'DEGRADED MODE — reversible verdicts only, confidence capped Medium.' : ''}\nObey doctrine §5 output shape. Banned phrases: "monitor closely", "consider testing", "keep an eye on".\nRespond with ONLY a JSON object matching the provided schema — transcript_md holds the human-readable §5-format transcript.`;
  const user = JSON.stringify({ trigger_reasons: triggerReasons, pack,
    output_schema: 'SessionJson (snapshot, floor[4], cross_examination[≥2], disagreement, verdict{action,why_it_wins,what_it_costs,kill_switch,dissent_on_record,also_cleared}, transcript_md)' });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system, messages: [{ role: 'user', content: user }] }),
  });
  const json = (await res.json()) as { content?: { text?: string }[]; usage?: { input_tokens: number; output_tokens: number }; error?: { message: string } };
  if (json.error) throw new Error(`Anthropic: ${json.error.message}`);
  const raw = (json.content?.[0]?.text ?? '').replace(/^```json\s*|\s*```$/g, '');
  const parsed = JSON.parse(raw) as SessionJson;

  const sb = getSupabase();
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const { data, error } = await sb.from('council_sessions').insert({
    date: today, brand, trigger_reasons: triggerReasons, data_mode: pack.dataMode,
    transcript_md: parsed.transcript_md, verdict: parsed.verdict, model: MODEL,
    input_tokens: json.usage?.input_tokens ?? null, output_tokens: json.usage?.output_tokens ?? null,
  }).select('id').single();
  if (error) throw new Error(`council_sessions insert: ${error.message}`);
  const sessionId = (data as { id: string }).id;

  const preds = [
    ...parsed.floor.map((f) => ({ expert: f.expert, p: f.prediction, taken: false })),
    { expert: 'CHAIR' as const, p: parsed.verdict.kill_switch, taken: true },
  ];
  for (const { expert, p, taken } of preds) {
    await sb.from('council_predictions').insert({
      date: today, brand, expert, session_id: sessionId, action_taken: taken,
      prediction_text: p.text, metric: p.metric ?? '', threshold: p.threshold,
      target_id: p.target_id, weight: taken ? 1.0 : 0.25,
      deadline: new Date(Date.now() + (p.deadline_days ?? 7) * 86400000 + 8 * 3600_000).toISOString().slice(0, 10),
      needs_manual: !p.metric,
    });
  }
  return { sessionId };
}

export function settledDay(): string {
  return new Date(Date.now() - 3 * 86400000 + 8 * 3600_000).toISOString().slice(0, 10);
}
```

- [ ] **Step 2: On-demand route** `app/api/admin/council/run/route.ts` — `requireAdmin()`, `maxDuration = 300`, `POST { brand?: 'BOSS' }` → `runCouncilSession(brand, ['manual run'])` → return `{ ok, sessionId }`.
- [ ] **Step 3: Typecheck; dry-run once** on :3099 (`curl -b /tmp/cookies.txt -X POST http://localhost:3099/api/admin/council/run -d '{}' -H "content-type: application/json"`), then read the stored transcript_md from Supabase and eyeball for §5 shape + distinct voices.
- [ ] **Step 4: Commit** — `git add lib/council/session.ts app/api/admin/council/run/route.ts && git commit -m "council: LLM session runner (doctrine-driven, structured verdict + ledger inserts)"`

---

### Task 10: Nightly pipeline route + daily-summary integration + pg_cron backup

**Files:**
- Create: `lib/council/pipeline.ts`
- Create: `app/api/cron/council/route.ts`
- Modify: `app/api/cron/daily-summary/route.ts` (inject brief before `sendTelegram`, line ~138)
- Modify: `vercel.json` (add `/api/cron/council` backup schedule `20 16 * * *`)

**Interfaces:**
- Produces: `runCouncilPipeline(brand: Brand): Promise<{ brief: string; graded: number; triggers: string[]; sessionId: string | null }>` — idempotent per Manila date (`pipelineRanToday` guard skips regrade; brief always recomposed from stored rows).

- [ ] **Step 1: Implement `lib/council/pipeline.ts`** — sequence: `syncAdMetricsDaily({ since: D-4, until: today })` → load `getAdSeries('BOSS')` → grade every ad with ≥1 delivery day (prev = latest verdict row) → `saveVerdicts` → weekly (`Monday`) `refreshPriors` → `resolveDuePredictions` → `detectTriggers` → if triggers non-empty and no session today: `runCouncilSession` (wrapped in try/catch — council failure never blocks the brief) → `buildBrief` from stored rows → return. Guard: if `pipelineRanToday`, skip sync+grade, still rebuild brief.
- [ ] **Step 2: `/api/cron/council/route.ts`** — `verifyCronAuth`, `maxDuration = 300`, GET → `runCouncilPipeline('BOSS')`, returns JSON summary. This is the pg_cron backup entry.
- [ ] **Step 3: Modify `daily-summary`** — after existing `lines` are built and BEFORE `sendTelegram`: 

```ts
// Ads Council daily brief (§5.3) — pipeline is idempotent; if the backup tick
// already ran tonight this just rebuilds the brief text from stored verdicts.
try {
  const { runCouncilPipeline } = await import('@/lib/council/pipeline');
  const council = await runCouncilPipeline('BOSS');
  lines.push('', council.brief);
} catch (err) {
  lines.push('', '⚠️ Ads Council brief failed — check /admin/ads?view=council');
  console.error('[daily-summary] council pipeline failed', err);
}
```
- [ ] **Step 4: vercel.json** — add `{ "path": "/api/cron/council", "schedule": "20 16 * * *" }`.
- [ ] **Step 5: pg_cron backup tick** (same pattern as `bosslabs-sequences-tick`; CRON_SECRET from `.env.production.local`):

```sql
select cron.schedule('bosslabs-council-tick', '20 16 * * *',
  $job$select net.http_get(url:='https://www.bosslabs.live/api/cron/council',
    headers:='{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb, timeout_milliseconds:=290000)$job$);
```
- [ ] **Step 6: Local verify** — hit `http://localhost:3099/api/cron/council` with the cron bearer; expect JSON with `graded > 0` and a 12-line brief. Re-hit: `graded` skipped (idempotent).
- [ ] **Step 7: Commit** — `git add lib/council/pipeline.ts app/api/cron/council/route.ts app/api/cron/daily-summary/route.ts vercel.json && git commit -m "council: nightly pipeline + brief in midnight digest + backup tick"`

---

### Task 11: Executor + guardrails (TDD)

**Files:**
- Create: `lib/council/executor.ts`
- Test: `tests/council/executor.test.ts`

**Interfaces:**
- Produces:

```ts
export function checkPauseGuardrail(args: { adSpend7ByAd: Record<string, number>;
  alreadyPausedTodayCentavos: number; adId: string }): { ok: boolean; reason?: string };
export function clampBudget(currentCentavos: number, requestedCentavos: number): number;   // ±20%
export async function executeAction(a: { brand: Brand; sessionId: string | null;
  type: 'pause_ad' | 'unpause_ad' | 'set_budget'; targetId: string;
  requestedBudgetCentavos?: number; mode: Mode; executedBy: string }): Promise<{ ok: boolean; result: string }>;
```

- [ ] **Step 1: Failing tests** — `checkPauseGuardrail` refuses when ad's trailing-7d daily-avg spend + already-paused-today exceeds 20% of campaign daily spend; refuses LEARNING targets (caller passes tier — add `tier: Tier` param and test it); `clampBudget(100000, 200000) === 120000`, `clampBudget(100000, 50000) === 80000`.
- [ ] **Step 2: Implement.** `executeAction` POSTs Graph API `/{id}` with `status=PAUSED|ACTIVE` or `/{campaignId}` with `daily_budget` (clamped); logs to `council_actions` with before/after regardless of outcome; when `META_ADS_TOKEN` lacks write scope, Graph returns an OAuth error — store it in `result` and return `ok:false` (the UI surfaces "write token required").
- [ ] **Step 3: Green + commit** — `git add lib/council/executor.ts tests/council/executor.test.ts && git commit -m "council: mode-gated executor with hard guardrails"`

---

### Task 12: Ads tab — verdict badges + Advise column

**Files:**
- Create: `components/admin/council/VerdictBadge.tsx`
- Create: `components/admin/council/AdviseDrawer.tsx` (client; opens on click, shows interpretation + deciding metrics + tier-flip + tier history strip)
- Modify: `app/admin/ads/page.tsx` (fetch `getLatestVerdicts('BOSS')` alongside existing report; thread `verdictByAdId` into the ads table section at the hierarchical table ~line 325; roster counts in campaign header)

**Interfaces:**
- Consumes: `getLatestVerdicts`, `getVerdictHistory` (server action or API `GET /api/admin/council/ad-history?adId=` for the drawer).

- [ ] **Step 1: `VerdictBadge`** — pill with emoji + tier + role tag (`🟢 WINNING · PROSPECTOR`), colors: emerald/amber/rose/sky matching existing `pill pill-*` classes; `title={headline}` for hover.
- [ ] **Step 2: `AdviseDrawer`** — client component; fixed right-side panel (same pattern as `AdPreviewCell` modal in this page); fetches history on open; renders headline, interpretation, `deciding_metrics` as a definition list, tier_flip_condition, and last-30-day tier strip (colored squares).
- [ ] **Step 3: Wire into `app/admin/ads/page.tsx`** — ad rows get `<VerdictBadge v={verdictByAdId[e.id]} />` + advise cell (headline text, click → drawer). Missing verdict row → em-dash and, if `ad_metrics_daily` empty, one banner above the table: “Run backfill to activate the council” with a button POSTing the backfill route.
- [ ] **Step 4: Verify on :3099** — `/admin/ads` shows badges with real data; screenshot for the user.
- [ ] **Step 5: Commit** — `git add components/admin/council app/admin/ads/page.tsx && git commit -m "council: verdict badges + advise drawer in ads tab"`

---

### Task 13: Council view (`?view=council`)

**Files:**
- Create: `app/admin/ads/CouncilView.tsx` (server component)
- Create: `components/admin/council/CouncilControls.tsx` (client: mode radio + target-CPP input → server action)
- Create: `components/admin/council/LedgerTable.tsx` (client: predictions + manual HIT/MISS/PUSH buttons)
- Create: `app/admin/ads/council-actions.ts` (`'use server'`: `saveCouncilSettingsAction`, `resolvePredictionAction`, `runCouncilNowAction`, `executeVerdictAction`)
- Modify: `app/admin/ads/page.tsx` (route `searchParams.view === 'council'` → render `CouncilView`, mirroring the existing `view === 'results'` branch at ~line 134)

- [ ] **Step 1: `CouncilView`** — sections: ① Controls (mode + target + “Run council now” button + backfill button); ② Latest brief (monospace block); ③ Sessions list (date, triggers, verdict action, kill switch; expand → full `transcript_md` rendered as `<pre>`); ④ Ledger (open + resolved, expert weights row); ⑤ Action log.
- [ ] **Step 2: Server actions** — thin wrappers with `requireAdmin()`; `executeVerdictAction` refuses when mode is `recommend`, confirms guardrails via executor.
- [ ] **Step 3: Wire the view toggle** — header link pair `Overview | Council` (same pill style as existing range tabs).
- [ ] **Step 4: Verify on :3099** — flip to Council view, run a manual session, see transcript + ledger rows; screenshot.
- [ ] **Step 5: Commit** — `git add app/admin/ads components/admin/council && git commit -m "council: council view — controls, brief, sessions, ledger, actions"`

---

### Task 14: End-to-end + deploy

- [ ] **Step 1:** `npx tsc --noEmit` → 0 errors; `npx tsx --test tests/council/*.test.ts` → all pass.
- [ ] **Step 2:** `npm run build` → clean.
- [ ] **Step 3:** Full local pass on :3099: backfill (if not yet) → `/api/cron/council` tick → `/admin/ads` badges → `?view=council` brief + session. Screenshot both views for the user.
- [ ] **Step 4:** Push + verify prod: `git push origin main`; after deploy, hit `https://www.bosslabs.live/api/cron/council` with CRON_SECRET bearer → 200 JSON; check `/admin/ads` live.
- [ ] **Step 5:** Create the pg_cron backup tick (Task 10 Step 5 SQL) and verify `cron.job` row exists.
- [ ] **Step 6:** Confirm next midnight's Telegram digest contains the brief (or trigger `daily-summary` manually with the cron bearer and check Telegram).

## Self-review checklist (run after writing, fixed inline)

- Spec coverage: data spine (T1/T3/T4/T5), engine (T2), brief+triggers (T6), ledger (T7), pack (T8), sessions (T9), pipeline+telegram+pg_cron (T10), executor+modes (T11), ads-tab UI (T12), council view (T13), rollout (T14). Cohort CP: T8 (null-safe). Settled-day rule: engine `asOf` = `settledDay()` (T9/T10).
- Type consistency: `VerdictResult`, `AdSeries`, `CouncilSettingsRow`, `PriorsRow` defined once in T2 and imported everywhere; `windowsFor` exported from engine and reused by ledger/pack.
- No placeholders: every code step shows real code or an exact, complete instruction referencing code defined in this plan.
