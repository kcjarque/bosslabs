# Daily Seinfeld Newsletter — automation design

**Date:** 2026-07-13 · **Status:** approved, building

## Goal

Make a daily "Seinfeld" newsletter the **home base** of the email machine: everyone
who finishes any finite flow lands in it, an offer-link click pulls them into that
offer's SOS (pausing the newsletter), and when the SOS ends they resume the
newsletter on the exact beat they paused on. The newsletter is the always-on
**interest-finding engine**; the SOS is the closer.

## Approved product decisions

1. **SOS pauses the newsletter** (clean 4-5 day close, no overlap). Resume after.
2. **Abandoned carts keep the 3-email cart recovery**, then graduate to the newsletter.
3. **Kyle supplies the 60 daily bodies.** We build the engine + empty skeleton.

## Components

### 1. Newsletter sequence
- New sequence **"Daily Seinfeld Newsletter"**, `schedule_type = after_subscribe`,
  **60 daily steps** (hours_offset 0, 24, … 1416 = Day 0…59), templates
  `nl_d01`…`nl_d60` (placeholder bodies Kyle fills).
- Manual-enroll only (empty anchor list). Ships **inactive**.

### 2. `send_state` = the traffic controller
One lane per contact:
| State | Meaning | Newsletter |
|---|---|---|
| `in_sequence` | inside a finite flow (reminders / Track A-B / cart recovery) | not yet |
| `active_broadcast` | finished all finite flows | dripping |
| `in_sos` | clicked an offer → in that SOS | **paused** |
| `in_winback` / `sunset` | dormancy lifecycle (owned by the lifecycle cron) | paused / off |

### 3. Router cron — `/api/cron/newsletter` (hourly)
Gated on the newsletter sequence being active (safe default off). Per live contact
(not unsub/suppressed/sunset/standaloneOto), derive the lane from **pending steps**
across all active sequences:
- **"busy"** = member of an active sequence with an active step whose target time
  (before/after_event vs the event; after_subscribe vs their anchor) is in the
  **future**. No `sequence_sends` lookup needed — a future step = still expecting mail.
- Categorize sequences by name: `Daily Seinfeld Newsletter` (newsletter),
  `SOS ·*` (SOS), everything else (finite).
- Desired lane: SOS-busy → `in_sos`; else finite-busy → `in_sequence`; else → `active_broadcast`.
- Never override `in_winback`/`sunset` (the lifecycle cron owns those).
- Transitions:
  - → `active_broadcast` and not yet subscribed → `enrollByName('Daily Seinfeld Newsletter')`.
  - entering `in_sos` → stamp `signups.newsletter_paused_at = now`.
  - leaving `in_sos` → `active_broadcast`: re-anchor the newsletter subscription
    `subscribed_at += (now − paused_at)` so the story resumes on the exact beat, then
    clear `paused_at`.

### 4. Newsletter drip pause
In the **sequences cron**, when the sequence being processed is the newsletter,
exclude contacts whose `send_state ∈ {in_sos, in_winback, sunset}` from the audience.
Finite flows and SOS are unaffected (they always fire).

## Data changes
- `signups.newsletter_paused_at timestamptz` (pause re-anchor).
- 60 `email_templates` (`nl_d01`…`nl_d60`) + one sequence + 60 `sequence_steps`.
- New cron in `vercel.json`.

## The loop
finite flows (`in_sequence`) → newsletter (`active_broadcast`) → click → SOS
(`in_sos`, newsletter paused) → SOS ends → newsletter resumes at the paused beat.

## Out of scope (v1)
- Missed-beat handling beyond the pause re-anchor (e.g., winback→newsletter re-entry re-anchor).
- SMS newsletter (email only).
- Writing the 60 bodies (Kyle supplies).
