# Prince Analysis v2 — Design Spec

**Date:** 2026-08-09
**Status:** Draft for review
**Scope:** `lib/council/*` (verdict pack + prompts) and `lib/meta-ads.ts`. No DB
migration. No new nightly sync. Brand scope: BOSS.

---

## 0. Governing philosophy — who Prince is

This is the north star for every prompt rule below. Prince is a **complete senior
media buyer** with the instincts of a Fortune-500 performance lead and the
**acumen of the business owner** — and it must hold three traits at once:

- **Business-owner mindset.** Every read and recommendation serves ONE objective:
  **make the business earn more and spend less.** Prince thinks in profit, ROAS,
  and growth — never vanity metrics. Each move ties to a business lever: *earn
  more* (scale winners, raise budgets, lean into efficient audiences/placements,
  test into whitespace) or *spend less* (cut waste, fix leaks, reallocate off
  draggers, stop paying for the wrong crowd).
- **Knows what to look for — does NOT overanalyze.** Prince *has* all the data in
  this spec, but a senior buyer doesn't recite dashboards. The council's job is
  JUDGMENT: diagnose the situation, decide which 1–3 signals actually matter right
  now, and act. Everything else is **reserve** — drawn on only when it changes the
  call or the owner asks. (This is what §5a enforces.)
- **Adapts to any scenario and scale.** Same brain whether the budget is ₱1k/day
  or ₱1M/day, whether the account is scaling, bleeding, stabilizing, or launching.
  Thresholds are relative (vs target / prior / blended), never hardcoded to one
  business size.

**The reconciliation:** the data layer (§3) makes Prince *complete*; the output
discipline (§5a) keeps it *sharp*. More data ≠ noisier reports — it means Prince
sees everything a Fortune-500 buyer would, then says only what a great one would.

---

## 1. Problem

Prince (the weekly Run Analysis on Opus, the `/prince` Q&A on Sonnet, and the
council session) reasons almost entirely on **CPP (cost per purchase, a count)**
over a **rolling 7-day-ending-D-3 window**, and hands the LLM a flat JSON pack
with no hierarchy between "this week" and "all history." Four concrete gaps,
each confirmed against the live account:

1. **No temporal hierarchy.** The prompt never says the week is the subject and
   history is background, so the model can anchor on lifetime/blended figures.
   "The week" is also defined three inconsistent ways (per-ad trailing-7-from-D-3,
   `weeklyTrend` ISO Mon–Sun, brief "this week" ISO-of-today) that don't line up.
2. **ROAS / purchase value is invisible.** `AdDay.revenueCentavos` is already
   synced from Meta `action_values` but **no code reads it**. Live proof: CPP
   rank ≠ ROAS rank — `14_24hrs` is mediocre by CPP (₱786/buyer) yet the top
   revenue engine (₱71,932, 1.83×), while `7_Manual2` looks like the CPP champion
   (₱186) but is tiny (₱929 spend). Blended = **2.49× ROAS**. Judging on CPP alone
   feeds the wrong ad and starves the best earner.
3. **Objective-blind.** Only budget type (CBO/ABO) is captured, not campaign
   **objective** or ad-set **optimization goal**. Live: 2 of 3 tracked campaigns
   optimize for **VALUE (ROAS)**, not conversion count — graded on the wrong
   metric. A future Messaging/Leads campaign would falsely read as "0 purchases →
   turn off." Plus a latent bug: `budgetType` labels every campaign `ADVANTAGE+`
   because they all return `smart_promotion_type=GUIDED_CREATION` (a red herring).
4. **No pacing, buyer-quality, or intra-week rhythm.** Prince can't tell whether
   weak results are a delivery problem (under-spending / budget-capped), whether
   an ad brings ₱999-only tire-kickers vs higher-value buyers, or which days of
   the week actually convert.

The paused-ad-status gap in this same audit is already fixed and shipped
(each pack ad now carries `active`/`status`; both prompts forbid off/scale/"let
run" on non-ACTIVE ads).

### 1a. Bugs folded into this fix (from the campaign-type check)

These three were surfaced while auditing campaign settings; all are fixed as part
of v2 (see §3b), tracked here so none is lost:

- **BUG-1 — Objective-blind.** The pack never carries the campaign objective, so a
  VALUE-optimized or (future) Messaging/Leads campaign is judged on
  cost-per-**purchase**. Result: wrong metric, and a non-sales campaign would
  false-fire "0 purchases → turn off." → Fix: fetch `objective`; per-objective
  judgment rules.
- **BUG-2 — Optimization goal ignored.** 2 of 3 live campaigns optimize for
  **VALUE (ROAS)**, but nothing reads `optimization_goal`, so they're ranked by
  CPP against a count-optimized campaign — apples-to-oranges. → Fix: fetch
  `optimization_goal`; VALUE ad sets lead with ROAS.
- **BUG-3 — `GUIDED_CREATION → ADVANTAGE+` mislabel (live today).** `budgetType`
  treats any `smart_promotion_type` as ADVANTAGE+; all three campaigns return
  `GUIDED_CREATION` (a normal guided-creation marker), so **every** campaign is
  mislabeled ADVANTAGE+ and Prince's CBO/ABO/ASC structure advice is wrong right
  now. → Fix: treat `GUIDED_CREATION` as normal; detect real ASC via its actual
  marker; otherwise CBO/ABO by budget location.

---

## 2. The temporal model (the spine)

**CORE = THE WEEK.** One definition everywhere: the **just-finished Mon–Sun**
calendar week (the week concluding on the run's Sunday). The trailing ~3 days
fall inside Meta's 72h restatement window, so they are **carried but flagged
"still settling — rough."** Hard calls lean on the settled Mon–Thu; the fresh
Fri–Sun tail is directional.

**HISTORY = supplementary.** The 4-week arc, past plans (self-grade), cohorts,
lifetime totals, structure, movement — all relabeled **CONTEXT**. Used only to
*explain* the week ("CPP up this week — third straight week frequency climbed"),
never graded on their own.

Implementation:

- **New** `weekWindow(series, weekStart, weekEnd, settledCutoff)` in
  `verdict-engine.ts` computes the Mon–Sun span metrics **plus** a settled-only
  sub-total (days ≤ `settledCutoff = today−3`) so the pack can present
  `thisWeek` and `thisWeekSettled` side by side. Prior week = the immediately
  preceding Mon–Sun (fully settled) for week-over-week deltas.
- The **existing** `windowsFor(series, asOf)` (trailing-7-from-D-3, settled) is
  **left unchanged** — it feeds the deterministic `gradeAd` tiers, which must
  stay settled-only to avoid false kills. v2 does not destabilize that safety
  layer; it adds a narrative week-window beside it.
- `weeklyTrend` and the brief's "this week" cohort line are re-anchored to the
  **same Mon–Sun** definition so all "week" figures share one span.
- Both prompts get a **SCOPE law** at the very top: *"You are judging THIS WEEK
  (the just-finished Mon–Sun; its last ~3 days are still settling — treat as
  rough). Everything else in the pack is BACKGROUND to explain this week — never
  grade the history itself."*
- Every pack block is grouped/labeled `thisWeek:` vs `context:`.

---

## 3. Data additions (all from existing data unless noted)

### 3a. ROAS + purchase value + AOV — core
`revenueCentavos` already exists per `AdDay`. Add to the **new `weekWindow`**
only (the pack's this-week ad metrics come from `weekWindow`, not `windowsFor`,
so `windowsFor` and the deterministic tiers stay untouched):
- `revenue7`, `revenuePrior7` (centavos)
- `roas7 = revenue7 / spend7`, `roasPrior7` (ratio)
- `avgOrderValue7 = revenue7 / purchases7` (centavos) — buyer-quality proxy
- Blended campaign `totalRevenue7`, `blendedRoas7`, `blendedAov7` + priors
- **`weeklyTrend` gains `roas` + `revenue`** per week = the ROAS movement arc

**Prompt:** ROAS and CPP are **co-equal and can disagree**. Rank what to
scale/feed by **ROAS + revenue**, not cheapest CPP. AOV near ₱999 = front-only /
tire-kickers; AOV well above ₱999 = upsell/high-value buyers landing. Note the
attribution limit: pixel value is front-funnel only; retreat/DFY back-end is not
ad-attributed (it lives in `cohorts`/`backEnd`, unattributed).

### 3b. Objective + optimization awareness (+ bug fix)
Extend `getCampaignStructures()`:
- campaign graph call → add `objective`
- adsets graph call → add `optimization_goal`, `bid_strategy`, `promoted_object`
- `CampaignStructure` gains `objective`; each ad set gains `optimizationGoal`,
  `bidStrategy`, `customEventType` (from `promoted_object.custom_event_type`).
- **Fix** `budgetType`: stop treating any `smart_promotion_type` as ADVANTAGE+
  (`GUIDED_CREATION` is normal). Detect real ASC via the campaign's actual ASC
  marker; otherwise CBO/ABO by where the budget sits.

**Prompt:** `OUTCOME_SALES` → judge on ROAS/CPP; **VALUE-optimized ad sets →
lead with ROAS**, not CPP; a non-sales objective (Messaging/Leads) → **never**
judged on cost-per-purchase (0 purchases ≠ failure — its conversion is a
message/lead). Note a cost-cap bid strategy when present.

### 3c. Pacing / budget utilization — context
Join budgets (already fetched via `getCampaignStructures`/`getCampaignBudget`)
to spend (in the series, aggregated by campaign/ad set from the pack ads):
- per campaign (CBO) or ad set (ABO): `dailyBudgetCentavos`, `avgDailySpend7`,
  `utilizationPct = avgDailySpend7 / dailyBudget`
- flags: `underDelivering` (utilization < ~70% sustained) and `budgetCapped`
  (utilization ≈ 100% on a winner → can't scale without raising budget)

**Prompt:** if results are weak but utilization is low → it's a **delivery**
problem (raise/consolidate budget, fix targeting), not creative. If a winner is
budget-capped → the lever is raise the campaign/ad-set budget.

### 3d. Day-of-week rhythm — context
Over the **4-week context window** (4 samples per weekday for stability, not the
single analyzed week), compute per-weekday blended CPP + ROAS. Surface as
`context.dayOfWeek: [{weekday, cpp, roas, spendShare}]`.

**Prompt:** use only to spot rhythm ("weekends convert ~30% pricier") — it's
context, not a reason to cut an ad.

### 3e. Placement breakdown — context (live best-effort)
Live insights fetch for the analyzed week,
`breakdowns=publisher_platform,platform_position`, aggregated per placement:
spend, ROAS, CPP, purchases. **Confirmed live:** FB Feed ₱115k @ 2.28×, **FB
Reels ₱62k @ 1.29× (dragging)**, FB Stories 2.97×, IG Reels 2.74×.

**Prompt:** flag a placement quietly dragging blended cost (low-ROAS placement
eating real spend) → shift budget or exclude it (audience/delivery lever). It's a
placement move, not a per-ad cut.

### 3f. Audience breakdown (age / gender / region) — context (live best-effort)
`breakdowns=age,gender` (one call) + `breakdowns=region` (separate — Meta can't
combine with age/gender). Per-segment spend / ROAS / CPP. **Confirmed live:**
35-44 male 2.84× (best big segment), 25-34 female 1.01× (weakest).

**Prompt:** name who's actually buying *profitably* vs who's burning spend →
tighten/exclude weak segments, lean into strong ones. Context, not a per-ad cut.

### 3g. Attribution window + micro-conversions — context
- **Attribution window:** ad-set `attribution_spec` (added to
  `getCampaignStructures`) → how conversions/ROAS are credited (e.g. 7d-click /
  1d-view). Prince reads ROAS honestly in light of the window.
- **Micro-conversions:** from the SAME weekly insights `actions[]` —
  `add_to_cart` + `initiate_checkout` counts, alongside the `landing_page_view`
  already tracked. Completes the funnel chain: clicks → LP views → ATC → IC →
  purchase, so Prince names WHERE mid-funnel the money leaks.

Both live best-effort; no migration.

---

## 4. Pack shape (labeled)

```
{
  brand, asOf, weekStart, weekEnd, settledCutoff, dataMode,
  thisWeek: {
    campaign: { spend, revenue, roas, cpp, cpm, linkCtr, cvr, aov, reach, freq,
                ...prior-week twins, ...settledOnly subtotals },
    ads: [{ adId, adName, active, status, campaignName, adSetName, objective,
            optimizationGoal, ageDays,
            week: { spend, revenue, roas, cpp, aov, cpm, linkCtr, cvr, freq,
                    hookRate, holdRate, lpViewRate, viewToPurchase, ...prior twins,
                    settledOnly },
            creative }],
    pacing: [{ scope:'campaign'|'adset', name, budgetType, dailyBudget,
               avgDailySpend, utilizationPct, underDelivering, budgetCapped }],
    breakdowns: {
      placement: [{ placement, spend, roas, cpp, purchases }],       // FB feed/reels/stories, IG…
      audience:  [{ segment, spend, roas, cpp, purchases }],         // age/gender + region
    },
    funnel: { linkClicks, lpViews, addToCart, initiateCheckout, purchases }, // micro-conv chain
  },
  context: {
    weeklyTrend: [{ weekStart, spend, cpp, cpm, linkCtr, cvr, roas, revenue }], // 4wk
    dayOfWeek: [{ weekday, cpp, roas, spendShare }],                            // 4wk
    structure, recentChanges, winningCreatives, cohorts,
    pastPlans, priors, weights, openPredictions, lastVerdict, backEnd,
  },
  settings,
}
```

Ad tiers (WINNING/LOSER…) stay in the pack but are labeled **"current ad state
(settled)"** so they don't masquerade as this-week narrative.

---

## 5. Guardrails — explicitly unchanged
- **Daily pulse** stays a 1-day deterministic heartbeat (no LLM). One addition:
  show **yesterday's ROAS** beside CPP.
- **Deterministic verdict tiers** keep settled-only trailing-7 discipline (no
  false kills). Not re-windowed to Mon–Sun.
- **Paused-ad rule** (shipped) stays: never advise off/scale/"let run" on a
  non-ACTIVE ad.
- Unit conventions (centavos/pesos/%) and the Telegram escape-then-bold render
  are unchanged.

## 5a. Output discipline — signal over noise (the "don't overanalyze" rule)
The whole point of §0's persona. Added to BOTH prompts:
- **Lead with the decision/diagnosis, not the data.** One-line bottom line first.
- **Cite only the 1–3 numbers that drive the call.** The rest of the pack is
  reserve — reference it only if it changes the recommendation or the owner asks.
- **Frame every recommendation as earn-more or spend-less**, tied to the objective.
- **No metric-dumping.** A senior buyer says *"Cut FB Reels — it's eating ₱62k at
  1.29× while Feed does 2.28×; move it to Feed + Stories,"* not a table of every
  placement. Having 10 data points is for KNOWING what to look at, not for
  reciting all 10.
- Scenario-first: name the situation (scaling / bleeding / stabilizing /
  launching) and advise for THAT, at THIS budget scale.

## 6. Non-goals
- No DB migration; no change to the nightly sync fields (revenue already synced).
  Placement/audience/micro-conversion breakdowns are **live best-effort fetches**
  at pack-assembly time (same pattern as `getCampaignStructures`/`getRecentChanges`
  /`getAdStatuses`), run in parallel; a Meta hiccup degrades to omitting them, never
  sinks the pack. If `/prince` latency suffers from the extra calls, gate the
  breakdowns to the weekly session only (the deep analysis) — decided at impl.
- No back-end (retreat/DFY) ad-attribution — that linkage still doesn't exist.
- No change to doctrine tier thresholds.

## 7. Files touched
- `lib/council/verdict-engine.ts` — `weekWindow()`, ROAS/revenue/AOV fields.
- `lib/council/pack.ts` — Mon–Sun anchoring, `thisWeek`/`context` grouping,
  pacing + day-of-week aggregates, ROAS in `weeklyTrend`, wire in breakdowns.
- **`lib/council/breakdowns.ts` (new)** — live best-effort placement + audience
  (age/gender/region) + micro-conversion (ATC/IC) weekly fetches.
- `lib/meta-ads.ts` — objective/optimization/bid + `attribution_spec` on
  `getCampaignStructures`; ADVANTAGE+ detection fix (GUIDED_CREATION).
- `lib/council/session.ts` + `lib/council/prince.ts` — **§0 persona + §5a output
  discipline**, SCOPE law, ROAS co-equal, objective rules, pacing/day-of-week/
  placement/audience/funnel rules, relabeled context.
- `lib/council/brief.ts` + `pipeline.ts` — yesterday ROAS in pulse; Mon–Sun
  cohort alignment.
- Tests/factories updated for new fields.

## 8. Verification
- Typecheck + build clean.
- Live pack probe: confirm `thisWeek` = correct Mon–Sun span, ROAS matches the
  2.49× blended, pacing utilization is sane, objective reads `OUTCOME_SALES`,
  ADVANTAGE+ no longer mislabels all three campaigns, placement shows the FB-Reels
  drag (1.29×), audience shows 35-44 M strongest, micro-conversion counts return.
- Dry-run one `/prince` question + one weekly session; eyeball the §0/§5a persona:
  leads with the decision (earn-more/spend-less), cites only the 1–3 driving
  numbers, treats history as context, and does NOT metric-dump.
