# BossLabs AI — Email & SMS Flow (Full Audit)

_Generated 2026-07-12 from the live DB. Every email body + SMS body below is the exact stored template (markdown source, with `{{variables}}`)._

Layers: **transactional** (instant on an event) + **drip sequences** (timed, `/api/cron/sequences` every 10 min). Sequences are cloned per webinar event — identical structures are collapsed, clones listed.


---

## 1 · Transactional (instant sends)

### ▸ Free registration (no payment)

📧 **Email** `free_welcome` — *You're in, {{firstName}} — your Zoom link is below*

```
^^BOSSLABS AI · You're in^^

# Welcome, {{firstName}}.

Your seat for the BOSSLABS AI Webinar is locked in. Save the date and bring one workflow you want to automate.

**{{webinarDate}} · {{webinarTime}} {{webinarTimezone}}**

[[Join the Zoom call]]({{zoomJoinUrl}})

One more step — unlock your Free Gift by joining our Facebook community:

[[Join the BOSSLABS Facebook group]](https://www.facebook.com/share/g/18iYKmoNPc/)

— Mikee & Kyle
BOSSLABS AI · Built in Manila
```

📱 **SMS** `free_welcome` — Hi {{firstName}}! You’re in for BOSSLABS AI. Save the date {{webinarDate}} at {{webinarTime}}. Join the Facebook group for your free gift: https://www.facebook.com/share/g/18iYKmoNPc/

### ▸ Paid webinar ticket (₱999)

📧 **Email** `paid_confirmation` — *Ticket confirmed — see you on {{webinarDate}}*

```
^^BOSSLABS AI · AI Vibe Coding 101^^
# You're in, {{firstName}}!

Payment received: **{{amount}}**. Your seat for **{{webinarDate}} at {{webinarTime}} {{webinarTimezone}}** is locked.

Your Zoom link:
[[Join the webinar]]({{zoomJoinUrl}})

Save this email — we'll send reminders, but this is your backup.

See you in the room.

— Mikee & Kyle
```

📱 **SMS** `paid_confirmation` — BOSSLABS AI: Payment received: {{amount}}. {{firstName}}, your seat is locked for {{webinarDate}} at {{webinarTime}}. Check your email for your Zoom link + details.

### ▸ Vault OTO purchased

📧 **Email** `vault_confirmation` — *Your AI Secrets Builder Vault — payment confirmed, {{firstName}}*

```
^^Payment received · Vault^^

# You're in, {{firstName}}!

Your **AI Secrets Builder Vault** is confirmed — payment of **{{amount}}** received. Thank you!

Inside the Vault:

- All past live build recordings — full end-to-end
- BossLabs AI-Flix — step-by-step tutorials (1-year access)
- The BossLabs Hub — prompts, skills & starter repos
- The 4-Step Vision-to-Reality App Blueprint

We'll send your access shortly — keep an eye on this inbox. Questions? Just reply to this email.

[Join the Facebook group →](https://www.facebook.com/share/g/18iYKmoNPc/)

— Mikey & Kyle

---

## 🙏 Help us reach more Filipino founders

We're on a mission to make every Filipino business tech-enabled — built by the boss, not bought from an agency. Every review pushes BossLabs in front of one more founder who needs to see this.

[[Leave us a quick review on Facebook →]](https://www.facebook.com/bosslabsai/)

30 seconds. One sentence. Massive impact on someone you'll never meet.
```

📱 **SMS** `vault_confirmation` — BOSSLABS AI: Payment received: {{amount}}. {{firstName}}, your AI Secrets Builder Vault is unlocked! Access details coming to your email shortly.

### ▸ 1:1 Executive Session OTO purchased

📧 **Email** `oto_confirmation` — *Your 1:1 Executive Session is confirmed, {{firstName}}*

```
^^Payment received · 1:1 Executive Session locked in^^

# You're in, {{firstName}}!

Your **Personal 1:1 Executive Session with the Founders** is confirmed. We received your payment of **{{amount}}** — thank you!

## What happens next

Kyle & Mikey will personally reach out to schedule your session at a time that works for you. Come ready to talk business — real opportunities, 7-to-9-figure growth, and how to scale your marketing, sales & operations. Keep an eye on this email and your phone.

While you wait, come say hi in the BOSSLABS community:

[Join the Facebook group →](https://www.facebook.com/share/g/18iYKmoNPc/)

---

## Want to ship in one weekend? Join the Retreat.

You've locked in your 1:1 — the natural next move is the **VibeCode Retreat**: one weekend in a Tagaytay villa, you walk out with a launched app. Only **15 seats** in the cohort, July 31 – August 1.

₱60,000 standard / ₱50,000 pay-in-full / ₱10,000 deposit to secure your seat.

[[See the Retreat →]](https://www.bosslabs.live/vibecode-retreat)

Questions? Just reply to this email — we read every one.

— Mikey & Kyle
```

📱 **SMS** `oto_confirmation` — BOSSLABS AI: Payment received: {{amount}}. {{firstName}}, your 1:1 Executive Session with the founders is confirmed! We will message you to schedule. Check your email for details.

### ▸ Retreat — reservation / deposit

📧 **Email** `retreat_reserved` — *We’ve got your VibeCode Retreat reservation, {{firstName}}*

```
^^Reservation received · VibeCode Retreat^^

# Thanks, {{firstName}}!

We’ve received your reservation for the **VibeCode Retreat**.

To lock your slot, just complete your payment — once it’s in, we’ll confirm and send you the full details (date, venue, and what to bring) soon.

Questions? Just reply to this email — we read every one.

— Mikey & Kyle
```

📱 **SMS** `retreat_reserved` — BOSSLABS AI: Hi {{firstName}}, we got your VibeCode Retreat reservation! Complete your payment to lock your slot. Full details coming soon.

### ▸ Retreat — paid in full

📧 **Email** `retreat_confirmation` — *Payment received — your VibeCode Retreat slot is reserved, {{firstName}}*

```
^^Payment received · VibeCode Retreat^^

# You're in, {{firstName}}!

We've received your payment of **{{amount}}** for the **VibeCode Retreat** — your slot is reserved. 🎉

We'll send the full details (date, venue, schedule, and what to bring) soon. Keep an eye on this inbox.

Questions? Just reply to this email.

— Mikey & Kyle
```

📱 **SMS** `retreat_confirmation` — BOSSLABS AI: Payment received: {{amount}}. {{firstName}}, your VibeCode Retreat slot is reserved! Full details coming soon.

### ▸ Replay (day after webinar · cron)

📧 **Email** `replay` — *Replay is up — 7 days only, {{firstName}}*

```
^^Replay · 7-day window^^

# Watch it again — or for the first time.

Here's your replay. After 7 days it comes down, so block off some time this week.

[[Watch the replay]](https://www.bosslabs.live/replay)

---

## 🎓 Get your Certificate of Participation
While you’re here — claim your signed **Certificate of Participation** for attending. Takes 10 seconds:
[[🎓 Get my certificate]](https://www.bosslabs.live/certificate)
```

📱 **SMS** `replay` — BOSSLABS AI replay is up for 7 days. Watch this week: {{replayUrl}}

### ▸ Payment recovery (manual, customer page)

📧 **Email** `payment_recovery` — *{{firstName}}, your seat isn't locked yet*

```
^^Almost there^^
# Your seat isn't locked yet, {{firstName}}.

You started signing up for AI Vibe Coding 101, but your payment did not go through — so your seat is not secured yet.

The good news: you can finish in under a minute.

[[Complete my payment]]({{checkoutUrl}})

Seats are limited and we'd hate for you to miss it.
```

📱 **SMS** `payment_recovery` — Hi {{firstName}}! Your AI Vibe Coding 101 seat isn't locked yet — payment didn't go through. Finish in 1 min: {{checkoutUrl}}

### ▸ Closer — direct offer

📧 **Email** `closer_offer_direct` — *{{firstName}}, take a look at the {{productName}}*

```
^^A quick one from your BossLabs closer^^

# The {{productName}}

Hi {{firstName}}, it's {{closerName}} from BOSSLABS AI. Wanted to put the **{{productName}}** ({{finalPrice}}) in front of you — here's the link:

[[View the {{productName}} →]]({{link}})

Happy to walk you through it or answer any questions — just reply.

{{closerName}} · BOSSLABS AI
```

📱 **SMS** `closer_offer_direct` — BOSSLABS AI: Hi {{firstName}}! {{closerName}} here — take a look at the {{productName}} ({{finalPrice}}): {{link}}

### ▸ Closer — promo offer

📧 **Email** `closer_promo_offer` — *{{firstName}}, your private {{discountLabel}} on the {{productName}}*

```
^^Private offer — just for you^^

# {{discountLabel}} on the {{productName}}

Hi {{firstName}}, it's {{closerName}} from BOSSLABS AI. After the webinar I set aside a personal deal for you on the **{{productName}}**.

Your price drops to **{{finalPrice}}** — normally {{basePrice}}, so you save **{{savings}}** with your private code.

**Your private code: {{promoCode}}**

[[Claim {{discountLabel}} now →]]({{link}})

Your code is already built into that button, so your discount shows up automatically the moment you land. This is a personal offer just for you — please keep the code to yourself.

Talk soon,
{{closerName}} · BOSSLABS AI
```

📱 **SMS** `closer_promo_offer` — BOSSLABS AI: Hi {{firstName}}! {{closerName}} here with a private {{discountLabel}} on the {{productName}} — pay just {{finalPrice}} (save {{savings}}) with code {{promoCode}}. Claim: {{link}}

**Custom HTML (not template rows):** Hub credentials email (`lib/hub-credentials-email.ts`, on Vault provision) · Certificate email (`/certificate` request).


---

## 2 · Drip sequences


### 2.1 · Webinar Reminder Sequence

**Audience:** AI Vibe Coding 101 - June 13 — Paid · **Steps:** 10 · **Status:** 🟢 active

**Event clones (6):** Webinar Reminder Sequence, Webinar Reminder Sequence — June 18, Webinar Reminder Sequence — June 24, Webinar Reminder Sequence — July 2, Webinar Reminder Sequence — July 9, Webinar Reminder Sequence — July 18


#### Step 1 · 60h before webinar

📧 **Email** `reminder_60h` — *You're confirmed for {{webinarDate}} — let's make it count*

```
^^60-hour reminder^^

# You're confirmed, {{firstName}}.

You're confirmed for the BOSSLABS session on **{{webinarDate}}, {{webinarTime}} {{webinarTimezone}}**. Glad to have you in.

One request while it's in front of you: block {{webinarTime}} in your calendar right now, and set a reminder for 15 minutes before. 

It sounds basic, but it's the single thing that separates the people who get full value from a session like this and the people who mean to attend and don't.

You've already invested in being there. Let's make sure you actually are.

Over the next two days I'll send a few short notes so you walk in ready. For now — calendar blocked?

[[Open the Zoom call]]({{zoomJoinUrl}})

— Mikey

P.S. Come with one real bottleneck in your business in mind. You'll see why on the night.
```

📱 SMS — _none_


#### Step 2 · 48h before webinar

📧 **Email** `reminder_48h` — *Here's exactly what we're building for you live*

```
^^48-hour reminder^^

# Here's what to expect, {{firstName}}.

Two days out. Let me tell you precisely what to expect on **{{webinarDate}}**, because it's different from most things labeled "AI webinar."

We're not running slides full of theory. I will be building a working app **live, from zero**, in front of you. 

Here's the shape of the night:
— A real app built step by step, nothing pre-recorded
— The exact system we use for our SME clients
— A straight answer to the question most owners carry: *can I actually do this myself?*

This is the kind of session where what you see changes how you think about your own business by the end. 

That only works if you're in the room while it happens.

**{{webinarDate}}, {{webinarTime}} {{webinarTimezone}}.** You're in.

[[Open the Zoom call]]({{zoomJoinUrl}})

**IMPORTANT NOTE:** 
This webinar will be best if you follow us with your own AI Coding Apps! If you want to fully experience this with us, kindly download your **Claude.ai or ChatGPT Codex** on your desktop

— Mikey

P.S. Keep that one bottleneck in mind. By the end you'll see exactly how a system like this removes it.
```

📱 SMS — _none_


#### Step 3 · 36h before webinar

📧 **Email** `reminder_36h` — *This won't be replayed in full — here's why that matters*

```
^^36-hour reminder^^

# The live room is where the value lives.

Hi {{firstName}} — a direct note, because it's the thing that quietly costs people the most.

The temptation with any paid session is to think, *"I've already paid — I'll just catch the replay."* I want to be honest with you: we are not replaying this in full. The live build, the real-time problem-solving, the part where you can ask and we answer — none of that survives in a recording. The value is in the room.

You invested to be there live. Don't trade that for a recording that won't exist.

**{{webinarDate}}, {{webinarTime}} {{webinarTimezone}}.** Log in a few minutes early.

[[Open the Zoom call]]({{zoomJoinUrl}})

— Mikey

P.S. Bring the bottleneck. The live portion is where it actually gets solved.

**IMPORTANT NOTE:** 
This webinar will be best if you follow us with your own AI Coding App! If you want to fully experience this with us, kindly download your **Claude.ai or ChatGPT Codex** on your desktop
```

📱 SMS — _none_


#### Step 4 · 24h before webinar

📧 **Email** `reminder_24h` — *Tomorrow, {{webinarTime}} — here's how the night runs*

```
^^24-hour reminder^^

# Tomorrow at {{webinarTime}}, {{firstName}}.

Tomorrow — **{{webinarDate}}, {{webinarTime}} {{webinarTimezone}}**. Here's the run of show so you know what you're walking into:

— We open by framing the one thing that changes everything (don't miss this — it sets up the rest)
— Live app build from zero, every step visible
— The exact system behind our SME client work
— A clear path for anyone ready to take the next step

Log in by {{webinarTime}} minus 5. The opening sets up everything that follows, so the first minutes matter most.

[[Open the Zoom call]]({{zoomJoinUrl}})

Mikey

P.S. This isn't replayed in full. Tomorrow night is the room.

**IMPORTANT NOTE:** 
This webinar will be best if you follow us with your own AI Coding Apps! If you want to fully experience this with us, kindly download your **Claude.ai or ChatGPT Codex** on your desktop
```

📱 **SMS** `reminder_24h` — BOSSLABS AI: Hi {{firstName}}! Tomorrow at {{webinarTime}} {{webinarTimezone}}. Save this link for tonight: {{zoomJoinUrl}}


#### Step 5 · 12h before webinar

📧 **Email** `reminder_12h` — *Tonight, {{webinarTime}}. Your link's here.*

```
^^12-hour reminder^^

# Tonight's the night, {{firstName}}.

Tonight — **{{webinarTime}} {{webinarTimezone}}**.

You committed to this for a reason. Whatever made you say yes, tonight you'll see exactly how it gets solved — live.

[[Open the Zoom call]]({{zoomJoinUrl}})

Log in 5 minutes early so you don't miss the opening. See you tonight.

— Kyle
```

📱 **SMS** `reminder_12h` — BOSSLABS AI in 12 hours, {{firstName}}. Tomorrow {{webinarTime}} {{webinarTimezone}}. Bring one workflow to automate. Check email for the Zoom link.


#### Step 6 · 3h before webinar

📧 **Email** `reminder_3h` — *A few hours out — quick heads up before tonight*

```
^^3-hour reminder^^

# A few hours out, {{firstName}}.

We go live in a few hours — **{{webinarTime}} {{webinarTimezone}} tonight**.

Quick checklist so the evening's smooth: wind down your day a little early, find a quiet spot, and have that one business bottleneck ready in your head. You'll know what to do with it by the end.

This is the afternoon where most people quietly decide whether they'll actually show. You already paid for your seat — take it.

[[Open the Zoom call]]({{zoomJoinUrl}})

See you at {{webinarTime}}.

— Mikey
```

📱 **SMS** `reminder_3h` — BOSSLABS AI in 3 hours, {{firstName}}. Block {{webinarTime}} {{webinarTimezone}} in your calendar now. Check email for the Zoom link.


#### Step 7 · 1h before webinar

📧 **Email** `reminder_1h` — *We start in an hour — see you in the room*

```
^^Starts in 1 hour^^

# One hour to go, {{firstName}}.

One hour to go — **{{webinarTime}} {{webinarTimezone}} sharp**.

You're already in. All that's left is to actually be in the room when it counts. Join a few minutes early so you're settled before we open.

[[Open the Zoom call]]({{zoomJoinUrl}})

See you inside,
Mikey
```

📱 **SMS** `reminder_1h` — BOSSLABS AI starts in 1 hour, {{firstName}}. Open Zoom: {{zoomJoinUrl}}


#### Step 8 · 0.25h before webinar

📧 **Email** `reminder_15min` — *🔔 Starting in 15 minutes — san ka na, {{firstName}}?*

```
^^15 minutes^^
# San ka na, {{firstName}}?

We start in **15 minutes** — open Zoom now, grab a coffee, and meet us at {{webinarTime}} {{webinarTimezone}} sharp.

[[Open the Zoom call]]({{zoomJoinUrl}})

Bring one workflow you want to automate. We'll show you how to build it tonight.
```

📱 **SMS** `reminder_15min` — BOSSLABS AI starts in 15 min, {{firstName}}! San ka na? Join: {{zoomJoinUrl}}


#### Step 9 · at webinar start

📧 **Email** `final_call` — *🔴 LIVE na kami — pumasok na, {{firstName}}!*

```
^^Live now^^

# Live na kami, {{firstName}}!

Nagsimula na ang BOSSLABS AI — **{{webinarTime}} {{webinarTimezone}}**. Wag nang mag-abang — pumasok na sa Zoom ngayon din.

[[Join the Zoom call now]]({{zoomJoinUrl}})

See you inside — lets build!
```

📱 **SMS** `final_call` — BOSSLABS AI - FINAL CALL, {{firstName}}! Kakasimula palang, Join: {{zoomJoinUrl}}


#### Step 10 · at start +0.25h

📧 **Email** `15_minutes_after_san_ka_na` — *15-Minutes After - San ka na?*

```
^^BOSSLABS AI^^
# Hey {{firstName}}!!

Dito na kami? san ka na?

 **15 minutes in** — open Zoom now!! 

[[Open the Zoom call]]({{zoomJoinUrl}})

Let's build tonight!!!
```

📱 **SMS** `15_minutes_after_san_ka_na` — BOSSLABS AI: 15 mins in na, {{firstName}}! San ka na? Pumasok na: {{zoomJoinUrl}}


### 2.2 · After-Webinar — Paid (Order Bump → Community → Retreat)

**Audience:** AI Vibe Coding 101 - June 4 — Paid · **Steps:** 5 · **Status:** 🟢 active

**Event clones (7):** After-Webinar — Paid (Order Bump → Community → Retreat), After-Webinar — Paid (June 13), After-Webinar — Paid (June 18), After-Webinar — Paid (June 24), After-Webinar — Paid (July 2), After-Webinar — Paid (July 9), After-Webinar — Paid (July 18)


#### Step 1 · at start +15h

📧 **Email** `pw_orderbump` — *{{firstName}}, you showed up. Now make it count 🔓*

```
^^You're in · Replay inside^^
# You showed up, {{firstName}}. Most don't.

That alone puts you ahead. Now let's make sure you actually **ship** — not "someday."

The fastest way is a **Personal 1:1 Executive Session with the Founders**: a private, boardroom-level call with Kyle & Mikey — ex-multinational operators. We go deep on real business opportunities, 7-to-9-figure growth, and how to scale your marketing, sales & operations with AI — the moves that claw back **₱100K+/month** for YOUR business.

Here's the catch — this is the **only** time you'll get it at the attendee price of **₱5,997** (normally ₱11,997). When your replay window closes, it goes back up.

[[Add my 1:1 Executive Session — ₱5,997]](https://www.bosslabs.live/order-bump)

Ready for the bigger play? Join the **VibeCode Retreat** — one weekend in Tagaytay, 15 seats only, you walk out with a launched app. July 31 – August 1.
[[See the Retreat →]](https://www.bosslabs.live/vibecode-retreat)

— Mikee & Kyle
```

📱 **SMS** `pw_orderbump_sms` — BOSSLABS AI: {{firstName}}, you showed up — now ship it. Add your 1:1 Executive Session with the founders at the attendee price (₱5,997, was ₱11,997) before your replay window closes: https://www.bosslabs.live/order-bump


#### Step 2 · at start +27h

📧 **Email** `pw_orderbump2` — *{{firstName}}, ₱5,997 closes when your replay does — that’s TONIGHT*

```
^^Last call · Attendee price expires^^
# The window closes when your replay closes, {{firstName}}.

The early operators in every wave got rich. **Ecom 2010 → ₱billion Lazada/Shopee exits.** Crypto 2017 → quiet ₱millionaires you'll never meet. **AI 2026?** The boss who builds first owns the market. The boss who waits, rents from the boss who built.

We only run a handful of **1:1 Executive Sessions** each cohort — a private, boardroom-level call with the founders (ex-multinational operators). We go deep on real business opportunities, 7-to-9-figure growth plays, and how to scale your marketing, sales & operations with AI.

The **₱5,997 attendee price** disappears the moment your replay window closes.

[[Lock in my 1:1 Executive Session before it's gone]](https://www.bosslabs.live/order-bump)

Once it's back to ₱11,997, that's the price. No exceptions. Don't be the founder telling this story to your kids who looked at AI and said *"maybe later."*

— Mikee & Kyle

---

## 🙏 Help us reach more Filipino founders

We're on a mission to make every Filipino business tech-enabled — built by the boss, not bought from an agency. Every review pushes BossLabs in front of one more founder who needs to see this.

[[Leave us a quick review on Facebook →]](https://www.facebook.com/bosslabsai/)

30 seconds. One sentence. Massive impact on someone you'll never meet.
```

📱 **SMS** `pw_orderbump2_sms` — BOSSLABS AI: {{firstName}}, the ₱5,997 attendee price on your 1:1 Executive Session closes with your replay window. Lock it in now: https://www.bosslabs.live/order-bump


#### Step 3 · at start +41h

📧 **Email** `pw_community` — *{{firstName}}, the next AI millionaire is already in this room*

```
^^Your community · Where it gets real^^
# Don't build alone, {{firstName}}.

The Filipinos who got rich in ecom didn't do it solo. They had **rooms.** Closed circles where founders dropped wins, swapped what worked, and pulled each other up. The ones who built alone in 2012 are still building alone in 2026.

We run a **private BOSSLABS founders community** — where the cohort drops wins, swaps prompts, finds co-founders, and gets unstuck fast. **It's where the next opportunities get shared FIRST.** Before the public sees them.

The next Filipino AI millionaire is in there right now, building. Be in the same room.

[[Join the BOSSLABS Founders Group]](https://www.facebook.com/share/g/18iYKmoNPc/)

Come say hi — tell us what you're building.

— Mikee & Kyle

---

## 🙏 Help us reach more Filipino founders

We're on a mission to make every Filipino business tech-enabled — built by the boss, not bought from an agency. Every review pushes BossLabs in front of one more founder who needs to see this.

[[Leave us a quick review on Facebook →]](https://www.facebook.com/bosslabsai/)

30 seconds. One sentence. Massive impact on someone you'll never meet.
```

📱 **SMS** `pw_community_sms` — BOSSLABS AI: {{firstName}}, jump into the private BOSSLABS founders community — wins, prompts, co-founders, opportunities. Free + active: https://www.facebook.com/share/g/18iYKmoNPc/


#### Step 4 · at start +65h

📧 **Email** `pw_retreat` — *{{firstName}}, walk out with your app built — VibeCode Retreat*

```
^^15 seats · One Weekend · One Build^^
# Ready to actually build it, {{firstName}}?

The webinar showed you what's possible. The **VibeCode Retreat** is where you ship.

**One Weekend. One Build. 15 Founders.** July 31 – August 1, 2026 in Tagaytay. You walk in with an idea — you walk out with a **launched app** for your business. Premium villa, private chef, the founders building beside you.

**Only 15 seats.** First come, first served.

**₱75,000 (was ₱100,000) · ₱10,000 deposit to secure your seat.**

[[See the VibeCode Retreat + reserve your seat]](https://www.bosslabs.live/vibecode-retreat)

— Mikee & Kyle
```

📱 **SMS** `pw_retreat_sms` — BOSSLABS AI: {{firstName}}, the VibeCode Retreat — one weekend, you ship your app. 15 seats only, Jul 31-Aug 1 Tagaytay. PHP 75k (was 100k) / 10k deposit. https://www.bosslabs.live/vibecode-retreat


#### Step 5 · at start +89h

📧 **Email** `pw_lastcall` — *Final call, {{firstName}} — Retreat + your 1:1 session*

```
^^Final call^^
# Two doors are closing, {{firstName}}.

**1. The VibeCode Retreat** — **15 seats only**, July 31 – August 1 in Tagaytay. One weekend, one build, you ship by Saturday. If you've been on the fence, this is the moment.

[[Reserve your Retreat seat]](https://www.bosslabs.live/vibecode-retreat)

**2. Your ₱5,997 1:1 Executive Session** — the attendee rate on your private 1:1 Executive Session with the founders is about to expire. After that it's ₱11,997.

[[Add my 1:1 Executive Session — ₱5,997]](https://www.bosslabs.live/order-bump)

**3. Your Certificate of Participation** — don’t forget to grab your signed certificate for attending. Free, 10 seconds:

[[🎓 Get my certificate]](https://www.bosslabs.live/certificate)

Whatever you choose — choose to **ship**. That's the whole point.

— Mikee & Kyle
```

📱 **SMS** `pw_lastcall_sms` — BOSSLABS AI: Final call {{firstName}} — VibeCode Retreat (15 seats, Jul 31-Aug 1 Tagaytay) + your PHP 5,997 1:1 Executive Session both close now. Retreat: https://www.bosslabs.live/vibecode-retreat / Session: https://www.bosslabs.live/order-bump


### 2.3 · Cart Recovery (Abandoned Checkout)

**Audience:** Abandoned Checkout - June 13 · **Steps:** 3 · **Status:** 🟢 active

**Event clones (6):** Cart Recovery (Abandoned Checkout), Cart Recovery (Abandoned Checkout) — June 18, Cart Recovery (Abandoned Checkout) — June 24, Cart Recovery (Abandoned Checkout) — July 2, Cart Recovery (Abandoned Checkout) — July 9, Cart Recovery (Abandoned Checkout) — July 18


#### Step 1 · +1h after opt-in

📧 **Email** `payment_recovery` — *{{firstName}}, your seat isn't locked yet*

```
^^Almost there^^
# Your seat isn't locked yet, {{firstName}}.

You started signing up for AI Vibe Coding 101, but your payment did not go through — so your seat is not secured yet.

The good news: you can finish in under a minute.

[[Complete my payment]]({{checkoutUrl}})

Seats are limited and we'd hate for you to miss it.
```

📱 **SMS** `payment_recovery` — Hi {{firstName}}! Your AI Vibe Coding 101 seat isn't locked yet — payment didn't go through. Finish in 1 min: {{checkoutUrl}}


#### Step 2 · +24h after opt-in

📧 **Email** `payment_recovery_24h` — *Still want your AI Vibe Coding 101 seat, {{firstName}}?*

```
^^Still holding your spot^^
# Still want in, {{firstName}}?

We're still holding a spot for you in AI Vibe Coding 101 — but it's filling up, and your payment hasn't come through yet.

Lock it in here:

[[Secure my seat]]({{checkoutUrl}})

It only takes a minute.
```

📱 **SMS** `payment_recovery_24h` — {{firstName}}, still holding your AI Vibe Coding 101 spot but it's filling up + still unpaid. Lock it in: {{checkoutUrl}}


#### Step 3 · +48h after opt-in

📧 **Email** `payment_recovery_final` — *Final call, {{firstName}} — last chance for your seat*

```
^^Final call^^
# Last chance, {{firstName}}.

This is the final reminder — seats for AI Vibe Coding 101 are closing and we can't hold yours much longer.

If you still want in, grab it now:

[[Grab my seat before it's gone]]({{checkoutUrl}})

If the timing isn't right, no worries — we won't email you about this again.
```

📱 **SMS** `payment_recovery_final` — Final call {{firstName}} — last chance for your AI Vibe Coding 101 seat before it closes: {{checkoutUrl}}


### 2.4 · Win-back to June 4

**Audience:** Past Abandons — AI Coding 101 · **Steps:** 2 · **Status:** 🟢 active

**Event clones (1):** Win-back to June 4


#### Step 1 · on opt-in / purchase

📧 **Email** `winback_june4` — *{{firstName}}, our first session was a success — want in on the next?*

```
^^Round one: success^^
# Look what we built, {{firstName}}.

Our very first AI Vibe Coding 101 session was a hit — we built a real, working app, live, start to finish.

[See what we built →](https://realestate-kappa-liard.vercel.app/admin/listings)

We're running it again: Thursday, June 4 at 7 PM. Want in on the next one?

[[Join us on June 4]]({{checkoutUrl}})

Seats are limited — we keep the room small on purpose.
```

📱 **SMS** `winback_june4` — {{firstName}}, our 1st AI Vibe Coding 101 was a success! See what we built: https://realestate-kappa-liard.vercel.app/admin/listings — join the next one June 4: {{checkoutUrl}}


#### Step 2 · +48h after opt-in

📧 **Email** `winback_june4_final` — *Last call for June 4, {{firstName}}*

```
^^Closing soon^^
# Last call for June 4, {{firstName}}.

You saw what we built last time — a real app, live. The next session (June 4, 7 PM) is almost full.

[[Save my seat]]({{checkoutUrl}})

If it's not the right time, no worries — this is the last we'll nudge you.
```

📱 **SMS** `winback_june4_final` — {{firstName}}, last call — June 4 AI Vibe Coding 101 seats almost gone. You saw what we built; come build yours: {{checkoutUrl}}


---

## 3 · Manual-only templates (sent from admin → Send)

### ▸ after_webinar

📧 **Email** `after_webinar` — *Thank you for joining, {{firstName}} — your replay + what is next 🎉*

```
^^BOSSLABS AI · AI Vibe Coding 101^^
# Thank you for joining, {{firstName}}!

What a session — thank you so much for showing up and building with us. It genuinely means the world.

## Your replay
The full replay will be ready on this link **tomorrow morning**:
[[Watch the replay]]({{replayUrl}})

## The app we built
Congratulations to everyone who built alongside us! Here is the app we created together — go have a play:
[[Open the app we built]](https://realestate-kappa-liard.vercel.app)

---

## 🎓 Your Certificate of Participation
You showed up and built — now make it official. Claim your signed certificate, dated to your session, in 10 seconds:
[[🎓 Get my certificate]](https://www.bosslabs.live/certificate)

## A few shots from the night!![Screenshot 2026-05-28 at 10.21.51 PM](https://hsbowpbuqlctxeglpqyd.supabase.co/storage/v1/object/public/email-assets/email/1779981624021-rrugnj.png)

---

## What is next — the VibeCode Retreat
Ready to go all in? **One weekend. One build. 15 founders.** July 31 – August 1 in Tagaytay. You walk in with an idea — you walk out with a **launched app** for your business.

Premium villa accommodation, private chef, the founders building beside you. **₱75,000 (was ₱100,000) / ₱10,000 deposit.**
[[Reserve your seat at the Retreat]](https://www.bosslabs.live/vibecode-retreat)

---

## Questions? Just message us
Got a question? Send us a message on [our Facebook Page](https://www.facebook.com/profile.php?id=61589686430234) — **we don't use AI bots on the page. We personally read and reply to every message.**

See you there.
```

### ▸ post_webinar_unpaid

📧 **Email** `post_webinar_unpaid` — *Your replay is inside, {{firstName}} — plus what comes next*

```
^^BOSSLABS AI · AI Vibe Coding 101^^
# Thanks for joining, {{firstName}}.

You showed up tonight — that already puts you ahead of most. Thank you for building with us.

## Your replay
Want to rewatch or catch what you missed? The full replay goes live on this link tomorrow morning:
[[Watch the replay]]({{replayUrl}})

## You saw what is possible
In one evening you watched real apps get built — no dev team, no months of waiting. Imagine what a full **weekend** in a Tagaytay villa with the founders building beside you could do for your business.

![Our AI Vibe Coding 101 event](https://placehold.co/1000x600/eef6fa/0093B8?text=Drop+your+event+photo+here)

---

## Your next step — the VibeCode Retreat
**One weekend. One build. 15 founders.** July 31 – August 1 in Tagaytay. You walk out with a real, working app for your business — not notes, an asset.

[[Reserve your seat at the Retreat]](https://www.bosslabs.live/vibecode-retreat)

₱75,000 (was ₱100,000) / ₱10,000 deposit. Seats are capped at 10. If you felt the pull tonight, do not sit on it.
```

### ▸ facebook_group

📧 **Email** `facebook_group` — *{{firstName}}, come join our Facebook community 💬*

```
^^BOSSLABS AI · Community^^
# Come build with us, {{firstName}} 🚀

There's a room where the real magic happens between events — and we'd love for you to be in it.

Our private Facebook community is where founders and builders learning AI vibe coding hang out: sharing wins, asking questions, swapping ideas, and shipping real apps together.

## What you'll get inside
A place to get unstuck when you're deep in a build. A front-row seat to what everyone else is creating. And first dibs on events, replays, and the **VibeCode Retreat**.

And the best part? **Real humans — we don't use AI bots. We personally read and reply.**

[[Join the Facebook group]](https://www.facebook.com/share/g/18iYKmoNPc/)

---

See you inside, {{firstName}}!
```

