# 🤴 Prince — BossLabs Media-Buyer Agent

**Everything about Prince: capabilities, data, prompts, crons, cost, guardrails, and how to use it.**
Last updated 2026-08-09 · brand scope: BOSS · lives in `bosslabs-ai` (LIVE www.bosslabs.live).

---

## 1. What Prince is

Prince is an AI media buyer that reads your Meta ads the way a senior strategist does — not just the numbers, but *what the creative is, what changed, what's still learning, where in the funnel money leaks, and what to make next.* It runs on top of the **Ads Council** engine (the grading + verdict + prediction-ledger system) and speaks to you in three ways, each at a deliberately different cadence so you **monitor daily but only act weekly** (over-management is the #1 way to wreck a working account).

| Surface | Cadence | Model | Job | Cost/run |
|---|---|---|---|---|
| **Daily Pulse** | Daily ~00:02 Manila | none (deterministic) | Heartbeat: "all steady" or a real fire | **₱0** |
| **Weekly Run Analysis** | **Sunday 10:00 Manila** | **Opus 5** | Deep diagnosis + ranked plan + creative ideas | ~₱36 |
| **`/prince <question>`** | On demand (Telegram) | **Sonnet 5** | Ask anything about the ads | ~₱10 |
| **Run Analysis now** (admin button) | On demand | Sonnet 5 | Manual full analysis | ~₱14 |

Estimated total run cost: **~₱500/month** to steer a ~₱1.2M/month ad budget (≈0.04%).

---

## 2. Cron schedule (Vercel `vercel.json`, all UTC → Manila = +8)

| Cron (UTC) | Manila | Route | What it does |
|---|---|---|---|
| `1 16 * * *` | 00:01 | `/api/cron/ads-sync` | Sync Meta spend snapshot |
| `2 16 * * *` | 00:02 | `/api/cron/daily-summary` | Business digest **+ Prince's daily pulse** (appended) |
| `20 16 * * *` | 00:20 | `/api/cron/council` | Backup tick — re-runs the daily data pipeline (idempotent) |
| `0 2 * * 0` | **Sun 10:00** | `/api/cron/weekly-analysis` | **The weekly Opus deep-dive** → full brief to Telegram |
| `*/10 * * * *` | — | `/api/cron/sequences` | (unrelated: pg_cron drip) |

- **Daily data pipeline** (`runCouncilPipeline('BOSS')`): sync → grade every ad → save verdicts → resolve due predictions → build the **pulse**. NO LLM. Runs inside daily-summary + the 00:20 backup.
- **Weekly** (`runCouncilPipeline('BOSS', { weekly: true })`): everything above **plus** a full council session on Opus with memory, sent as the full analysis brief. Runs OUTSIDE the "already ran today" guard (daily already graded) with a same-day dedup so it never double-charges.
- The real daily trigger is the inline call in `daily-summary`; `/api/cron/council` is the safety-net backup.

---

## 3. Models & config

| Surface | Env var | Default |
|---|---|---|
| `/prince` Q&A | `PRINCE_MODEL` | `claude-sonnet-5` |
| Weekly Run Analysis | `COUNCIL_WEEKLY_MODEL` | `claude-opus-5` |
| Manual "Run Analysis now" | `COUNCIL_MODEL` | `claude-sonnet-5` |
| Creative tagging (vision) | `COUNCIL_MODEL` | `claude-sonnet-5` |
| Daily pulse | — | none (deterministic) |

Change any model by setting the env var on Vercel. Haiku is deliberately **not** used for reasoning — too shallow for strategy.

**Required env vars:** `ANTHROPIC_API_KEY` (council + Prince), `OPENAI_API_KEY` (Whisper transcription for creative context), `META_ADS_TOKEN` (Graph API), `META_ADS_ACCOUNT_ID` (defaults 118264717761938), `TELEGRAM_WEBHOOK_SECRET` (verifies `/prince` webhook), plus the bot token + chat id in the `settings` table. Optional: `TELEGRAM_PRINCE_CHAT_ID` (extra authorized chat), `FFMPEG_PATH`/`FFPROBE_PATH` (local ffmpeg for the creative backfill).

**Cost per report** (measured: a full analysis ≈ 80k input + 8.5k output tokens):
- Sonnet 5: **~₱14** (intro pricing $2/$10 to Aug 31 2026; ~₱21 after at $3/$15)
- Opus 5: **~₱36** ($5/$25)
- `/prince` query: **~₱10** (shorter output)
- Daily pulse: **₱0**
- (at ~₱58/USD — verify the live rate)

---

## 4. The audit method — how Prince thinks

### 4.1 Diagnose before prescribe: the CPP waterfall

Every analysis first finds the **root-cause lever**, using:

> **CPP ≈ CPM × (1 / link-CTR) × (1 / CVR)** — plus fatigue as the time overlay.

| Symptom | Lever | Fix |
|---|---|---|
| CPM high/rising (campaign-level) | **Audience** | test audiences / broaden / narrow / placements — *not* creative |
| link-CTR low/falling (per-ad) | **Creative** | new creative; name the exact tag + persona + hook to test |
| CTR fine but CVR low | **Offer / post-click** | fix offer / landing page / audience-intent |
| CTR falling + frequency rising | **Fatigue** | refresh creative / cap frequency |

Audience/CPM reads at the **campaign** level (shared audience); creative/CTR/fatigue **per-ad**.

### 4.2 Go deeper (the finer signals)

- **Creative quality** (video only): **hook rate** (video plays ÷ impressions = thumbstop — do the first 3 seconds work?) and **hold rate** (thruplays ÷ plays — does the body hold them?). → "fix the first 3 seconds" vs "the body loses them" vs "the offer's weak."
- **CVR funnel decomposition**: **lpViewRate** (% of clicks that actually *loaded* the page — low = slow page / bounce, a tech fix) then **viewToPurchase** (% of landers who bought — offer/page/intent).

### 4.3 Structure-aware (budget is never per-ad)

Prince knows each campaign's **CBO / ABO / Advantage+** type + budgets + ad sets:
- **CBO / Advantage+**: can't lower one ad's budget → **turn the ad OFF** (algo reallocates); scale = raise the *campaign* budget or duplicate the winner.
- **ABO**: move budget at the **ad-set** level; ads sharing an ad set share one budget.
- Never says "trim this ad's budget" — it's not a real action.

### 4.4 Movement + learning phase (the account is a living system)

- **Movement feed** (Meta activity log, ~8 days): budgets moved, ads/campaigns on/off, new ads/ad sets built → attributes shifts to real edits, not guesses.
- **Learning phase** per ad set (`LEARNING` / `LEARNING_LIMITED` / `SUCCESS`): **never judge or cut an ad still learning** or **< ~5 days old**; a significant edit *resets* learning; `LEARNING_LIMITED` = structural (consolidate / raise budget, don't kill).

### 4.5 Memory + compounding

- **4-week trend** (blended CPP/CPM/link-CTR/CVR) — reads the month arc, not one snapshot.
- **Self-grading** (`pastPlans`): the last analyses + how many of each one's predictions **hit vs missed** → grades its own past advice and changes course when a lever already failed.
- **Winning-script mining**: the cheapest-per-buyer ads' actual hooks/transcripts feed the creative ideas.

### 4.6 Output (the weekly analysis emits)

- **diagnosis**: `{ root_cause, lever (audience|creative|offer|fatigue|mixed|healthy), evidence }`
- **action_plan**: 2–4 ranked steps, biggest lever first, each structure-correct + executable
- **creative_ideas**: 2–3 net-new concepts to shoot — each `{ concept, angle, persona, hook, why }`, grounded in winners + whitespace
- **verdict.action**: ONE plain-English headline for the phone
- Records genuine **dissent** — no fake consensus.

---

## 5. The data Prince sees (per analysis, `assemblePack`)

1. **Per-ad economics** — CPP, CPM, CTR, link-CTR, CVR, frequency, reach, spend, purchases, spend-share, tier (WINNING/WATCH/LOSER/LEARNING), role, days-in-tier, **prior-7d twins** (trend), **ageDays**.
2. **Creative DNA** — creativeTag, format, angle, persona, awareness, hook, visual quality, on-brand, transcript.
3. **Structure** — CBO/ABO/Advantage+, budgets, ad sets, **learning status** + last-significant-edit.
4. **Movement** — recent budget/on-off/new-ad/new-adset changes.
5. **Creative quality** — hook rate + hold rate (video-only; N/A on images).
6. **Funnel** — lpViewRate + viewToPurchase.
7. **Memory** — 4-week trend + pastPlans (self-grading) + winningCreatives (scripts).
8. **Campaign blended** — CPP/CPM/link-CTR/CVR, total reach, avg frequency.
9. **Business context** — weekly cohorts (buyers), backend income (webinar/DFY).

---

## 6. The prompt rules (baked into the council + `/prince`)

Prince's system prompt = the Ads Council **DOCTRINE.md** + runtime rules. The core rule blocks (in `lib/council/session.ts`):

- **DIAGNOSTIC_SPINE** — run the CPP waterfall, name the lever, converge on a ranked plan.
- **CREATIVE_METRICS_RULE** — use hook/hold (video-only, image-safe) + funnel decomposition.
- **MEMORY_RULE** — read the 4-week arc, grade your own past plans, change course on a failed lever.
- **STRUCTURE_RULE** — recommendations must be executable given CBO/ABO/Advantage+; budget is never per-ad.
- **MOVEMENT_LEARNING_RULE** — attribute shifts to real edits; never judge learning / freshly-edited / <5-day ads.
- **CREATIVE_IDEAS_RULE** — propose 2–3 new concepts grounded in winners + whitespace.
- **UNIT_CONVENTIONS** — CPP/spend are centavos, CPM pesos, CTR/CVR percentages.

`/prince` (`lib/council/prince.ts`) uses the same diagnostic framework in a conversational, plain-language persona (CEO briefing: bold headline + Why / Winning / Dragging / Do this + bullets), rendered safely for Telegram.

---

## 7. Guardrails (safety)

- **Recommend-only** — Prince advises; it never changes your ads. (The Council has a mode-gated executor, default `recommend`, unreachable without explicit mode change.)
- **Never kill a converting ad** — trim the weakest, not the earners.
- **Never judge learning / new / just-edited ads.**
- **Structure-correct** — never suggests an impossible per-ad budget cut.
- **Image-aware** — images are never faulted for missing hook/hold (shown N/A).
- **Circuit-breaker is high-bar** — the daily pulse only flags a fire when an ad spent **≥ 2× your target CPP with 0 sales** on the last settled day.
- **Telegram-safe rendering** — freeform output is escaped then only `**bold**` becomes tags (can't break on stray `<`/`&`).
- `/prince` is **locked to your chat** + secret-verified + deduped (no double answers).

---

## 8. Where it shows up

- **Telegram** — daily pulse (in the 00:02 summary), the weekly analysis (Sun 10am), and `/prince` replies. Command is registered in the "/" menu.
- **Admin** — `/admin/ads` → **Run Analysis** tab: manual "Run Analysis now" button, Prince's analyses (Problem + ranked plan + Creative to test per session), prediction ledger, action composer. The ads table has a **Creative** column (tag + hover context), and each ad's **Advise** opens a full-window modal.

---

## 9. Thresholds & tunables

| Thing | Value | Where |
|---|---|---|
| Daily fire | spend ≥ **2× targetCpp** with 0 sales (last settled day) | `pipeline.ts` |
| Video detection | plays ≥ **10% of impressions** (else hook/hold = N/A) | `verdict-engine.ts` |
| Winner (for script mining) | cpp7 present **& ≥ 3 buyers** in 7d, top 5 by CPP | `pack.ts` |
| Weekly window | 7-day settled + 4-week trend | `pack.ts` |
| Settled cutoff | D-3 (Meta restates ~72h) | `session.ts settledDay()` |
| Target CPP | `council_settings.targetCppCentavos` | DB (editable) |

---

## 10. File & data map

**Code:** `lib/council/` → `prince.ts` (/prince), `session.ts` (weekly session + prompt rules), `pipeline.ts` (daily/weekly orchestration + pulse + circuit-breaker), `pack.ts` (data assembly), `brief.ts` (pulse + weekly brief), `verdict-engine.ts` (grading + windowsFor metrics), `creative-context.ts` (creative extraction + tags + scripts), `db.ts`, `meta-sync.ts`. Plus `lib/meta-ads.ts` (structure + movement), `lib/telegram.ts` (send + md→HTML), `app/api/telegram/webhook/route.ts`, `app/api/cron/weekly-analysis/route.ts`, `app/admin/ads/*`.

**DB tables:** `ad_metrics_daily` (per-ad daily insights + video/funnel cols), `ad_creative_context` (creative tags + transcripts), `ad_verdict_history` (verdicts), `council_sessions` (analyses + diagnosis/plan/ideas), `council_predictions` (ledger), `council_settings`, `prince_queries` (dedup/log).

**Migrations:** `0054` creative context · `0055` prince_queries · `0056` video/funnel columns.

---

## 11. Maintenance

- **Register `/prince` webhook** (one-time / after bot change): `npx tsx scripts/setup-prince-telegram.ts`
- **Backfill creative context** (full-fidelity video keyframes + transcripts, local ffmpeg): `npx tsx scripts/analyze-creatives.ts` (`--force` to re-analyze all)
- **Backfill video/funnel columns** after a schema change: re-run `syncAdMetricsDaily({ since, until })` over the window.
- Nightly sync auto-picks-up new ads' creative context (capped, non-blocking).

---

## 12. Known limits

- **Advantage+/ASC** campaigns are largely automated — Prince recommends creative + campaign budget only, not per-ad moves.
- **Cohort → creative LTV** attribution doesn't exist yet (no column ties a retreat/DFY sale back to the ad/cohort that sourced it) — front-end CPP is the current optimization target; backend income is context-only.
- **Reach** is summed across ads (not deduped uniques) — labeled honestly on the dashboard.
- **Serverless has no ffmpeg** — the nightly cloud path classifies new videos from their poster thumbnail; full keyframe+transcript fidelity comes from the local backfill script.
- Structure/movement/learning are **live Meta reads** — on a Meta hiccup they degrade to empty (Prince falls back to "turn off", always valid) rather than guessing.

---

## v2 — Business-owner media-buyer upgrade (shipped 2026-08-09)

Full audit-driven upgrade. Spec: `docs/ads-council/2026-08-09-prince-analysis-v2-design.md`; plan: `…-plan.md`. Built subagent-per-task with a per-task + final whole-branch review; deterministic tiers, the daily pulse, and the paused-ad rule are untouched.

**Persona (governs both prompts):** a complete senior Fortune-500 media buyer with **business-owner acumen** — every call ties to *earn more / spend less*, thinks profit not vanity, adapts to any budget scale, and **does not over-analyze** (has all the data as reserve; surfaces only the 1–3 numbers that drive the decision).

**Profit anchor (§3h, `council_settings` via migration 0057, all editable):** `targetRoas` 2.0, `breakevenRoas` ~1.04 (Xendit fee 3.5%), `targetCppCentavos` ₱650, `dailyNetTargetCentavos` **₱50k/day NET** (the north star), `processingFeePct` 0.035. Prince computes current daily net, the gap to ₱50k, and the spend-at-target needed to close it — every scale/cut/hold is judged vs breakeven/target, never a raw ROAS. Unset economics → "no profit anchor, conservative reads".

**5-stage analysis method (§0b):** (1) braindump + classify ALL problems by type — **malfunction (ruled out first)** · creative · fatigue · audience · offer · setup · algorithm · market; (2) which data matters; (3) evidence; (4) solutions; (5) synthesis. **NULL-RESULT LAW** (a healthy week is a valid finding). **MINIMUM-SIGNAL** confidence tiers SOLID/DIRECTIONAL/NOISE — no cut/scale on NOISE. **Severity floor** (<~5% weekly spend → watchlist, not the briefing).

**Staged hybrid council:** the **weekly Run Analysis** runs a genuine **multi-pass council on Opus** (one cross-examined pass per stage, `runStagedCouncil`, ~₱300/run, cost-guard short-circuits a healthy week to 1 pass); **`/prince`** runs one fast Sonnet pass with the same method; the **daily pulse** stays deterministic (₱0) and now shows yesterday's ROAS.

**New data (all live/derived, one migration total):** ROAS + revenue + AOV (per-ad + blended + 4-week arc); campaign **objective + optimization goal + bid + attribution** (+ fixed the `GUIDED_CREATION→ADVANTAGE+` mislabel); **placement / age-gender-region / micro-conversion** breakdowns (brand-scoped server-side); **budget pacing/utilization**; **day-of-week** rhythm; **malfunction pre-check** (WITH_ISSUES / revenue-cliff / LP-collapse). All windowed to the **just-finished Mon–Sun week** (history = context).

**Confidence-tier nuance:** SOLID ≥10 purchases OR spend ≥3× CPA; DIRECTIONAL ≥3 OR ≥1× CPA; else NOISE. So a 5-buyer / ₱929 ad is DIRECTIONAL (cautious scale, labeled), not NOISE — the hard rule is only "never act on NOISE".

**Deferred to v2.1** (see spec §9): north-star-from-settled-subtotal, Pass-1-failure-not-null-result, pacing join by id-not-name, age/gender pagination, prompt caching, rendering the 5-stage output in the Telegram brief, creative-pipeline output, pixel-vs-bank MER.
