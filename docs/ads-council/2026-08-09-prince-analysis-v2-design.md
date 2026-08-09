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
  draggers, stop paying for the wrong crowd). **Profit, not just efficiency:**
  every ROAS/CPP read is judged against the **profit anchor** (§3h
  `breakevenRoas` / `targetBlendedCac`) — a raw "2.49×" is meaningless until
  stated as *above or below breakeven*.
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

## 0b. The analysis method — how Prince reasons (5 stages)

Every analysis follows this flow. The council **cross-checks at each stage** — no
stage's output is trusted until it's been challenged. This supersedes the old
single-pass "diagnose one lever, then prescribe."

**Stage 1 — Find & classify ALL problems (divergent first).** Braindump every
problem visible across the account, then tag each by TYPE — because the fix
depends on the type:
- **Malfunction (rule out FIRST)** — something *broken*: disapproved ad
  (`WITH_ISSUES`), pixel/tracking not firing (spend continues but purchases/
  revenue cliff to ~0), landing page down (lpViewRate collapses), any metric
  falling off a cliff overnight. A senior buyer asks "is it just broken?" before
  optimizing anything — never prescribe a creative fix for a tracking outage.
- **Creative** — ad isn't earning the click/watch (link-CTR, hook/hold).
- **Fatigue** — a working ad wearing out (CTR↓ + frequency↑).
- **Audience** — expensive to reach the right people (CPM, placement, demo).
- **Offer / post-click** — clicks don't convert (CVR, LP-view→purchase).
- **Setup / structure** — misconfig (wrong optimization goal, budget too low to
  exit learning, CBO starving a winner, wrong objective for the goal).
- **Algorithm / delivery** — learning not resolving, spend mis-allocating,
  Advantage+ mis-delivering.
- **Market / auction** — broad, simultaneous cost inflation across ALL
  campaigns/ads at once = external auction pressure (seasonality, competition,
  election/holiday surges), NOT a per-ad fault. Fix is hold / reprice / ride it
  out — NEVER restructure. *(Pulled forward from the v2.1 backlog — see §9.)*

**NULL-RESULT LAW (Stage 1).** A healthy account is a valid finding. If nothing
crosses the severity floor (§5a), say *"nothing needs fixing this week,"* name the
ONE thing to watch, and STOP. Do NOT manufacture problems to fill the stage —
"braindump every problem" means *list what's genuinely wrong*, never *invent
something to look busy*. Stage 1's divergence is bounded by real severity, not by
a quota.

**Stage 2 — Identify which data matters** to each problem (don't boil the ocean):
map each problem to its diagnostic metric(s) — creative→link-CTR/hook,
fatigue→CTR-trend+freq, audience→CPM/placement/demo, offer→CVR/funnel,
setup→structure/optimization, malfunction→status/metric-cliff.

**Stage 3 — Find the evidence** where it matters: the specific proof — the
placement dragging, the creative context, the demo segment, the funnel step that
leaks, the day a metric cliffed. Real numbers, not vibes.

**MINIMUM-SIGNAL RULE (confidence tiers).** Every evidence read — an ad, a
placement, a segment, a day-of-week, a funnel step — is tagged by how much data
backs it:
- **SOLID** — ≥ ~10 purchases OR spend ≥ ~3× blended CPA in the window.
- **DIRECTIONAL** — ≥ 3 purchases OR spend ≥ ~1× blended CPA.
- **NOISE** — below that.

HARD RULE: **no cut / scale / exclude recommendation may rest on NOISE-tier
evidence** — NOISE reads appear ONLY as "watch" items. DIRECTIONAL reads MUST be
labeled as such in the briefing. Day-of-week (§3d, 4 samples/weekday) is capped at
DIRECTIONAL by definition. *(Worked example: `7_Manual2` at ₱186 CPP on ₱929
spend is NOISE — never a scale call.)* Carried in `SessionJson` as
`problems[].evidence.confidence`.

**Stage 4 — Provide solutions**: per confirmed problem, the concrete executable
fix, framed **earn-more or spend-less**, structure-aware.

**Stage 5 — Full analysis**: synthesize into one cohesive briefing, ranked by
business impact, honest dissent on record.

**Staged council (Hybrid — decided):**
- **Weekly Run Analysis (Opus):** a genuine multi-pass council. Each stage is its
  own pass where the experts cross-examine the *previous* stage's output before it
  advances (problems challenged before data is picked; evidence challenged before
  solutions). Real rigor. Est ~₱300/run (~₱1.2k/mo — ~0.1% of ad spend).
- **/prince Q&A (Sonnet):** ONE fast pass using the SAME 5-stage structure
  (still find→classify→evidence→solve) — keeps answers snappy (~seconds).
- **Daily pulse:** unchanged (deterministic, no LLM).

Implementation note: `SessionJson` changes to carry the stages —
`problems:[{type, description, severity, pesoImpact, evidence:{…, confidence}}]`
→ `solutions:[…]` → synthesis — plus a `watchlist:[…]` array for below-floor /
NOISE-tier items (§5a severity floor) that stay OUT of the main briefing. And
`session.ts` gains a staged orchestrator for the weekly path. A small
deterministic **malfunction pre-check** (from `WITH_ISSUES` status + a
purchases/revenue-cliff scan of the series) flags candidates so the council never
misses an obvious outage.

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

### 3h. Economics anchor — core
A `settings.economics` block, configured per brand and carried in the pack, so
every ROAS/CPP call is judged against a PROFIT floor — not a raw number:
```
economics: {
  breakevenRoas,      // front-end ROAS at/below which the account loses money on the
                      //   front end, derived from margin (≈ 1 / frontEndMarginPct, net of fees)
  targetBlendedCac,   // allowable cost-per-front-end-buyer given back-end ascension.
                      //   ₱999 webinar is a LOSS-LEADER into retreat/DFY; back-end is NOT
                      //   ad-attributed, so the front-end target is SET FROM back-end economics
                      //   (e.g. "tolerate 1.5× front ROAS because X% ascend at ₱Y").
  frontEndMarginPct,  // gross margin on the ₱999 front-end product, net of processing/platform fees
  backEndNote,        // one line stating the ascension assumption behind targetBlendedCac
}
```
- Carried via the existing council settings (settings row / config) — **no new
  column, no migration.**
- **If `economics` is absent/unset:** Prince MUST say it is *"judging without a
  profit anchor — these are efficiency reads, not profit calls,"* and default to
  CONSERVATIVE reads (treat front-end breakeven as ~1.0×, don't greenlight
  scaling on ROAS alone, flag the uncertainty).

**Prompt (both weekly + `/prince`):** every scale / cut / hold call is justified
RELATIVE TO `breakevenRoas` / `targetBlendedCac`, never raw ROAS. "2.49× blended"
only belongs in the briefing when stated as above/below breakeven (e.g. "2.49× —
~1.7× above the 1.5× breakeven, so there's profitable room to scale"). Amends §0
and §5a.

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
  settings: { …, economics: { breakevenRoas, targetBlendedCac, frontEndMarginPct, backEndNote } }, // §3h — may be unset → conservative reads
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
- **Profit anchor (§3h), always.** Every scale/cut/hold is stated relative to
  `breakevenRoas` / `targetBlendedCac`, never as a raw ROAS. If `economics` is
  unset, say so out loud and read conservatively.
- **Confidence, always (§0b minimum-signal).** Never recommend a cut/scale on
  NOISE-tier evidence; label DIRECTIONAL reads as directional. NOISE → watch only.
- **Null-result + severity floor (§0b).** A healthy week is a valid answer — do
  not manufacture problems. Problems whose plausible impact is **< ~5% of weekly
  spend** go to the `watchlist` array, NOT the briefing; the briefing carries only
  above-floor problems, **ranked by peso impact**.
- **Scaling velocity guardrail.** Budget raises of >~20–30%/day risk re-entering
  learning, and any significant edit resets learning — so scale winners in STEPS,
  never overnight. *(Pulled forward from the v2.1 backlog — see §9.)*

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
- `lib/council/session.ts` — **§0b 5-stage method + staged multi-pass council**
  (weekly orchestrator: one cross-examined pass per stage), new `SessionJson`
  shape (`problems[{type,description,severity,pesoImpact,evidence:{…,confidence}}]`
  → `solutions` → synthesis, plus a `watchlist[]` array), **§0 persona + §5a output
  discipline**, SCOPE law, ROAS co-equal, objective rules, pacing/day-of-week/
  placement/audience/funnel rules, relabeled context, **plus the three required
  upgrades**: profit-anchor framing (§3h `breakevenRoas`/`targetBlendedCac`),
  minimum-signal confidence tiers (§0b), null-result law + severity floor (§0b/§5a),
  the market/auction problem type (§0b), and the scaling-velocity guardrail (§5a).
- `lib/council/prince.ts` — same persona + 5-stage method + all three upgrades,
  but SINGLE fast pass.
- `lib/council/db.ts` (`getCouncilSettings`) + `lib/council/types.ts` — carry the
  `economics` block (§3h) on the settings row/config; **no new column, no
  migration** (stored in the existing settings; conservative default when unset).
- **`lib/council/malfunction.ts` (new, small)** — deterministic pre-check:
  `WITH_ISSUES` ads + purchases/revenue-cliff scan → candidate outages the
  council must address first.
- `lib/council/brief.ts` + `pipeline.ts` — yesterday ROAS in pulse; Mon–Sun
  cohort alignment; run the weekly staged council instead of the single call.
- Tests/factories updated for new fields + the staged flow.

## 8. Verification
- Typecheck + build clean.
- Live pack probe: confirm `thisWeek` = correct Mon–Sun span, ROAS matches the
  2.49× blended, pacing utilization is sane, objective reads `OUTCOME_SALES`,
  ADVANTAGE+ no longer mislabels all three campaigns, placement shows the FB-Reels
  drag (1.29×), audience shows 35-44 M strongest, micro-conversion counts return.
- Dry-run one `/prince` question + one weekly session; eyeball the §0/§5a persona:
  leads with the decision (earn-more/spend-less), cites only the 1–3 driving
  numbers, treats history as context, and does NOT metric-dump.
- Weekly staged run: confirm it produces the 5 stages with real cross-examination
  between them, classifies problems by type, and the malfunction pre-check flags
  the 2 `WITH_ISSUES` ads (and any purchases/revenue cliff) as rule-out-first.
- **Required-upgrade dry-runs:**
  - **(a) Null-result:** a healthy-week fixture (nothing above the severity floor)
    produces a *"nothing needs fixing this week"* briefing with ONE watch item —
    no manufactured problems; below-floor items land in `watchlist`, not the briefing.
  - **(b) Minimum-signal:** a NOISE-tier "winner" (e.g. ₱186 CPP on ₱929 spend) is
    NOT recommended for scaling — it appears only as a watch item; DIRECTIONAL
    reads are labeled as such.
  - **(c) Profit anchor:** a scale/cut/hold call (e.g. on the 2.49× blended) is
    framed relative to `breakevenRoas` (above/below breakeven), never as a bare
    ROAS; with `economics` unset, Prince states it is judging without a profit anchor.

## 9. v2.1 backlog (not in this build)

Tracked so they're not lost; out of scope for v2 unless marked **pulled-forward**.

1. **Creative pipeline output.** A weekly "what to make next" brief — the winning
   hook/format/angle pattern, a fatigue ETA per current winner, and N specific new
   variants to brief the creator. Reuse BrandHub's **Pattern-Fit / Novelty**
   thinking. *Deferred — v2 already emits `creative_ideas`; this is the fuller,
   pipeline-grade version.*
2. **Market / auction problem type.** Broad simultaneous cost inflation across ALL
   campaigns/ads = external auction pressure (seasonality / competition); fix is
   hold / reprice, never restructure. **DECISION: PULLED INTO v2** — it's one
   taxonomy line + one prompt rule and it prevents a whole class of misdiagnosis
   (a per-ad "creative fix" for an account-wide auction spike). Now in §0b Stage 1;
   left listed here for the record.
3. **Pixel vs bank truth (blended MER).** A weekly line comparing pixel
   `action_values` revenue against actual Xendit-collected revenue (manual settings
   entry acceptable) to keep attribution honest — pixel over/under-count drifts over
   time. *Deferred — needs a revenue-truth input Prince doesn't have yet; pairs
   naturally with §3h economics once wired.*
4. **Scaling velocity guardrail.** Budget raises >~20–30%/day risk re-entering
   learning; significant edits reset learning; scale winners in steps. **DECISION:
   PULLED INTO v2** — one §5a line, cheap, and it prevents nuking a winner's
   learning by scaling too fast. Now in §5a; left listed here for the record.
