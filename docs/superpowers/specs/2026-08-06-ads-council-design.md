# Ads Council — Engineering Design
**2026-08-06 · bosslabs-ai · lives entirely inside `/admin/ads`**

Implements `docs/ads-council/DOCTRINE.md` (the operator's council spec, saved
verbatim next to this file — §-references below point there). This doc is the
HOW; the doctrine is the WHAT.

## Decisions log (settled in brainstorm, do not relitigate)

1. **One continuous build** — all four phases (data spine → verdict engine →
   brief/triggers → council/ledger/execution) land as a single project, in
   dependency order, no intermediate ship gates.
2. **BOSS only at launch, brand-ready schema.** Every table carries a `brand`
   column derived from the campaign-name prefix (`BOSSLABS |` → BOSS,
   `MEDIA |` → CONX, `AHENTE |` → LEO). CONX/LEO are message-objective
   campaigns with no ₱999 purchase event — they need a different KPI system
   and are OUT OF SCOPE until designed.
3. **Execution is a switchable mode**, not a fixed posture:
   `recommend` (default) → `one_click` → `autopilot`. Ground-Truth guardrails
   are enforced IN CODE at the execution layer regardless of mode.
4. **LLM = Anthropic** (`claude-sonnet-5`), key provided by operator as
   `ANTHROPIC_API_KEY`. Council sessions only — the verdict engine and daily
   brief are pure rules and cost ₱0.
5. **Architecture = nightly ledgered pipeline** (approach 1): everything
   precomputed and stored nightly; the UI only reads. Rejected: live-graded UI
   (verdict flip-flop, no tier history), external orchestrator (needless infra;
   doctrine §8's Inngest note adapted to this repo's Vercel-cron + pg_cron —
   the one deviation from the doctrine text).

## Architecture (nightly pipeline, Asia/Manila)

```
00:01 ads-sync (existing) ─┐
00:02 council pipeline ────┤ 1. sync: re-pull last 3 days per-ad metrics (72h restatement heals)
                           │ 2. grade: verdict engine → ad_verdict_history (append per ad per day)
                           │ 3. brief: 12-line text → merged into existing daily-summary Telegram
                           │ 4. triggers: LOSER flip / 2+ WATCH / 3-day CPP breach / MISS / window
                           │    close / Monday → enqueue council session
                           │ 5. ledger: resolve machine-checkable predictions vs settled data
                           └ 6. council (only if triggered): assemble pack → 1 Anthropic call →
                               council_sessions + council_predictions
```

The pipeline is invoked FROM WITHIN the existing daily-summary route, before
the Telegram digest is composed — so the digest always carries tonight's brief
and there is no cron race. Redundancy: a pg_cron backup tick at 16:20 UTC
calls a standalone idempotent pipeline route that skips if tonight's run is
already recorded (grading) and re-sends nothing (Telegram only ever sends from
the daily-summary path).

**Settled-data rule:** the verdict engine's 7d/prior-7d windows end at the
latest SETTLED day (D−3), per doctrine §5.3 — tiers and ledger scoring never
read the 72h-preliminary tail. The brief's YESTERDAY line is the only surface
that shows preliminary numbers, and it is labeled as such.

## Data spine

**`ad_metrics_daily`** — one row per ad per day. Columns: `brand, campaign_id,
campaign_name, adset_id, adset_name, ad_id, ad_name, date, spend_centavos,
impressions, reach, frequency, ctr, link_ctr, cpm, link_clicks, purchases,
revenue_centavos, synced_at`. Unique `(ad_id, date)`, upsert-safe. Purchases
come from insights `actions` (`offsite_conversion.fb_pixel_purchase`). The
affiliate `ad_insights_daily` table is untouched.

**Backfill route** `/api/admin/council/backfill` (admin cookie): full history
for tracked BOSSLABS campaigns, `time_increment=1`, paginated, since account
start. Re-runnable (upsert). This is the Mode A → Mode B flip.

**`ad_account_priors`** — recomputed weekly (and after backfill): per brand —
median winner lifespan, CPP drift %/week, weekday multipliers, payday-cycle
effect (1st/15th ±3d), daily CPP variance (σ). Powers the brief's
GOOD/NORMAL/SOFT/RED-FLAG line: a day is only SOFT if it exceeds the account's
own σ, per doctrine §4.1/§5.3.

**Cohort join** (computed at council-pack time, not stored): weekly buyer
cohorts from `signups` (paid/attended by payment week) + show-up where
attendance rows exist + Retreat/DFY revenue from `retreat-crm` / `dfy-crm`
sums → running Cohort Profit. Missing attendance renders as "no attendance
data", never a fake 0%.

## Verdict engine (`lib/council/verdict-engine.ts`)

Pure function `gradeAd(history, campaignCtx, priors, settings) → Verdict`.
Tiers evaluated in doctrine §5.2 order, first match wins:

- **LEARNING**: <72h old or <10 lifetime purchases. Advise = what's needed to
  graduate.
- **WINNING**: 7d CPP ≤ target AND spend_share stable/rising AND doing its
  role's job.
- **WATCH**: exactly one deterioration signal (CPP +10–20%, spend_share
  −20%+, freq↑+CTR↓, or CPM +25% flat CTR). Pausing a WATCH ad is a protocol
  violation — the engine says so in the advise text.
- **LOSER**: full §7.6 fatigue (CPP ≥+20% AND share declining AND freq/CTR
  deteriorating, ≥3 days) OR red-flag pattern OR zero purchases after
  3×target-CPP spend post-learning.

Role tag from 7d frequency: <1.3 PROSPECTOR, ≥2.0 CLOSER, else HYBRID.
Target CPP comes from `council_settings` (operator-set, editable in the ads
tab). Advise text (headline ≤90 chars + full interpretation + tier_flip
condition) is generated from deterministic templates per tier+role+signal —
no LLM. Engine output appends to:

**`ad_verdict_history`** — `(ad_id, date)` unique: `brand, ad_id, ad_name,
date, verdict, role, days_in_tier, changed bool, deciding_metrics jsonb,
headline_advice, full_interpretation, tier_flip_condition`. UI reads latest
row per ad; lifecycle view reads the series; `changed=true` rows are the
brief's MOVERS section and the council docket.

**Data-mode guard**: with <14 days of history for an ad's campaign, the
engine only emits LEARNING/DEGRADED verdicts (doctrine §4.1).

## Ads tab UI (all inside `/admin/ads`)

- **Overview (existing table)**: verdict badge column (🟢🟡🔴🔵 + role tag) +
  Advise cell (headline; `title` hover; click opens a drawer with full
  interpretation, deciding metrics, tier-flip condition, and a tier-history
  strip). Campaign header row gets roster counts.
- **Council view** (`?view=council`): mode switch (recommend / one_click /
  autopilot) + target-CPP editor; latest daily brief; session list with full
  §5-format transcripts; prediction ledger table with expert weights; action
  log. One new toggle in the existing header nav — no new sidebar entry.
- Badges render from stored verdicts (no Meta calls). If backfill hasn't run:
  a single "Run backfill to activate the council" banner.

## Daily brief + triggers

`lib/council/brief.ts` builds the 12-line §5.3 format; `daily-summary` cron
appends it to the existing Telegram digest. Yesterday's CPP labeled
*preliminary*; verdicts/ledger use ≥72h-settled data only. Trigger check per
doctrine §5.3; on quiet days the brief carries "Council not convened — no
triggers."

## Council runner (`/api/cron/council` + on-demand `/api/admin/council/run`)

- Assembles the data pack: last 14d per-ad series + 7d/prior-7d windows &
  deltas, campaign aggregates, cohort table, priors, current credibility
  weights, open predictions, last session's verdict + kill switch, current
  verdict roster, days-since-budget-change/creative-launch.
- ONE Anthropic Messages call, `claude-sonnet-5`, `max_tokens` ~8k: system
  prompt = doctrine §§1–7 (loaded from DOCTRINE.md at build of the prompt,
  condensed) + hard output rules; user = data pack JSON + trigger reasons +
  data-mode declaration. Response = structured JSON (snapshot, floor ×4,
  cross-exam, disagreement, verdict{action, why, cost, kill_switch, dissent,
  also_cleared}, ledger_updates) + rendered markdown transcript.
- Stored in **`council_sessions`**: `id, date, brand, trigger_reasons text[],
  data_mode, transcript_md, verdict jsonb, model, input_tokens,
  output_tokens, created_at`. Predictions (4 experts + CHAIR kill switch)
  insert into the ledger. Telegram brief links the session.
- Failure posture: council errors never block the brief; a failed session
  logs and retries next trigger.

## Ledger + weights

**`council_predictions`** per doctrine §6 schema + `weight numeric` (1.0 /
0.25 counterfactual / 0.5 research). Nightly resolution: predictions whose
`metric` is machine-checkable (`cpp_7d`, `spend_share`, `campaign_cpp`,
`spend`) score automatically vs `ad_metrics_daily` settled data; others flag
`needs_manual` for one-click HIT/MISS/PUSH in the Council view. Credibility
weight per expert per brand = 1.0 + (rolling-90d score × 0.1), clamped
[0.5, 2.0], computed at pack-assembly time (no separate table).

## Execution layer (`lib/council/executor.ts`)

`council_settings`: `brand pk, mode enum(recommend|one_click|autopilot),
target_cpp_centavos, updated_at`.

Actions: `pauseAd(adId)`, `unpauseAd(adId)`, `setCampaignBudget(campaignId,
centavos)`. Guardrails in code, every mode: refuse pausing ads summing >20%
of trailing-daily spend per day; budget changes clamped ±20%/day; never touch
LEARNING-tier ads; every attempt logged to **`council_actions`** (`id, date,
brand, session_id, action_type, target_id, before jsonb, after jsonb,
mode, executed_by, result`).

- `recommend`: verdict card shows the action; no buttons wired to Meta.
- `one_click`: Execute button + confirm modal per action; admin cookie.
- `autopilot`: pipeline executes the Chair's verdict + auto-fires kill
  switches when their threshold trips (kill-switch conditions stored
  machine-readable on the session row).

**Dependency**: current Meta token is read-scope. `one_click`/`autopilot`
require a token with `ads_management`; until provided, those modes save but
surface "write token required" and act as `recommend`.

## Testing

- Verdict engine: unit tests on fixture histories — one per tier boundary
  (fresh ad, healthy winner, single-signal watch, full-fatigue loser,
  zero-purchase loser, closer-graded-as-closer) + degraded-mode guard.
- Brief builder: snapshot tests (movers / no-movers / no-attendance-data).
- Guardrails: unit tests that pause->20%-spend and ±20% budget clamps refuse.
- Council: one dry-run against real backfilled data, transcript reviewed by
  operator before the Telegram link goes live.
- Ledger resolution: fixture predictions vs synthetic metric series.

## Rollout order

migration (ad_metrics_daily, ad_account_priors, ad_verdict_history,
council_sessions, council_predictions, council_actions, council_settings) →
backfill → nightly grading live → badges
visible in ads tab → brief in Telegram → dry-run council reviewed → triggers
armed (first real session Monday) → ledger accrues → operator flips mode when
trust is earned.

## Out of scope (flagged, not forgotten)

- CONX/LEO message-KPI system (needs its own design).
- Ben's CAPI value-optimization infrastructure (doctrine §7.3 — separate
  project; council may cite it 1×/week until built).
- Dara's monthly comment-mining SOP automation (manual for now).
- Auto-creation of ads/creatives — the council never authors creative.
