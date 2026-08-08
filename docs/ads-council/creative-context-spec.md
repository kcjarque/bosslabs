# Ads Council — Creative Context Extraction
**2026-08-08 · adds creative-strategy understanding to the council (not just numbers)**

## Goal
For every BOSS ad, extract *what the creative actually is* — format, angle, persona,
awareness level, hook, on-brand check, visual quality — so the council reasons about
creative strategy, not only CPP/CTR. Adapted (lean) from BrandHub's tag-meta-ad pipeline.

## Confirmed access (2026-08-08)
- Creative read: `GET /{ad_id}/adcreatives?fields=id,name,object_type,video_id,thumbnail_url,image_url,object_story_spec,body,title,asset_feed_spec` ✅ (the `ads{creative{}}` field-expansion returns null on this shared account — MUST use the adcreatives edge).
- Video source: `GET /{video_id}?fields=source,thumbnails` — needs the **Page access token** (BossLabs.AI Page now assigned to the SU). Derive via `GET /{page_id}?fields=access_token` using the ad-account token.
- Whisper: `OPENAI_API_KEY` set ✅. Anthropic vision: `ANTHROPIC_API_KEY` set ✅. ffmpeg: local (Mac) + `@ffmpeg-installer/ffmpeg` for Vercel.

## Data — `ad_creative_context` (migration 0054)
`brand, ad_id pk, creative_id, media_type ('video'|'image'|'other'), format, angle,
persona, awareness_level, hook_text, transcript, visual_quality int (1-5), on_brand bool,
tags jsonb, model, confidence numeric, creative_hash text, analyzed_at timestamptz`.
`creative_hash` = sha of (video_id||image_url||thumbnail_url) → re-analyze only on creative change.

## `lib/council/creative-context.ts` (pure-ish, service-role)
`analyzeAdCreative(adId, adName, brand) → Context`:
1. `fetchAdCreative(adId)` via the adcreatives edge → { objectType, videoId, imageUrl, thumbnailUrl, copy }.
2. hash unchanged + row exists → return cached (skip).
3. **image / share (no videoId):** image_url||thumbnail → Claude vision → structured context.
4. **video:** page-token → video `source` → ffmpeg: 3 keyframes (1s / mid / end) + audio track → Whisper transcript (auto-detect Taglish) → Claude vision(3 frames + transcript + ad copy) → context.
5. Fallback if video source unreachable → thumbnail-only (flag confidence lower). Never throws — errors return `{ error }`.
Model: Claude (vision) `claude-sonnet-5` for analysis; Whisper `whisper-1`. Structured JSON via balanced-brace extract + validate (reuse session.ts helpers).

## Callers (hybrid)
- `scripts/analyze-creatives.ts` — backfill all BOSS ads missing/changed context (local ffmpeg, uncapped, idempotent by creative_hash).
- Nightly pipeline: capped ≤5 new/changed ads/run (cloud, @ffmpeg-installer), non-blocking try/catch.

## Surfacing
- `assemblePack` joins creative_context per ad → council reasons "angle X saturated / persona Y uncovered."
- Advise drawer shows format/angle/persona/hook/quality.

## Taxonomy (what Claude emits) — kept tight
- format: video-testimonial | video-walkthrough | video-talkinghead | static-testimonial | static-graphic | carousel | other
- angle: testimonial | urgency | income-claim | problem-aware | objection | education | founder | proof-build | lifestyle | other
- persona: resto-owner | ofw | agency-owner | corporate-escapee | tita-tito | student | general
- awareness_level: unaware | problem-aware | solution-aware | product-aware | most-aware
- visual_quality 1-5, on_brand bool (bawal hao shao check), hook_text (first line/spoken), tags[] free.

## Deps to note
- `@ffmpeg-installer/ffmpeg` + `@ffprobe-installer/ffprobe` + `fluent-ffmpeg` (Vercel path); `openai` sdk (Whisper).
