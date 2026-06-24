// One-shot updater — swaps VibeCode Retreat copy for AI Founder's Bootcamp
// across the post-webinar email + SMS templates. Transactional VCR emails
// (retreat_reserved, retreat_confirmation, vault_confirmation, paid_confirmation)
// are deliberately untouched: they confirm purchases people already made.
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const EMAIL = {
  pw_retreat: {
    subject: "{{firstName}}, launch your app in 24 hours",
    body: `^^80 seats · Launch in 24 hours^^
# Ready to actually build it, {{firstName}}?

The webinar showed you what's possible. The **AI Founder's Bootcamp** is where you ship.

**24 hours.** You walk in with an idea — you walk out with a **launched app** for your business. Not a wireframe. Not a "someday" plan. A real, working, deployed application that solves a real problem.

**80 seats only.** Solo founders, founders bringing a co-pilot, or whole teams. Bring more, save more per seat: **₱25,000 solo · ₱22,000 trio · ₱20,000 squad of 5.**

[[See the Bootcamp + reserve a seat]](https://www.bosslabs.live/founders-bootcamp)

— Mikee & Kyle`,
  },
  pw_lastcall: {
    subject: "Final call, {{firstName}} — Bootcamp + your 1:1 session",
    body: `^^Final call^^
# Two doors are closing, {{firstName}}.

**1. The AI Founder's Bootcamp** — only **80 seats**, 24 hours to launch your app. The cohort is filling. If you've been on the fence, this is the moment.

[[Reserve your Bootcamp seat]](https://www.bosslabs.live/founders-bootcamp)

**2. Your ₱3,997 1:1 Build Session** — the attendee rate on the 1:1 Build Session with Kyle & Mikey is about to expire. After that it's ₱7,997.

[[Add my 1:1 Build Session — ₱3,997]](https://www.bosslabs.live/order-bump)

Whatever you choose — choose to **ship**. That's the whole point.

— Mikee & Kyle`,
  },
  after_webinar: {
    subject: "Thank you for joining, {{firstName}} — your replay + what is next 🎉",
    body: `^^BOSSLABS AI · AI Vibe Coding 101^^
# Thank you for joining, {{firstName}}!

What a session — thank you so much for showing up and building with us. It genuinely means the world.

## Your replay
The full replay will be ready on this link **tomorrow morning**:
[[Watch the replay]]({{replayUrl}})

## The app we built
Congratulations to everyone who built alongside us! Here is the app we created together — go have a play:
[[Open the app we built]](https://realestate-kappa-liard.vercel.app)

## A few shots from the night!![Screenshot 2026-05-28 at 10.21.51 PM](https://hsbowpbuqlctxeglpqyd.supabase.co/storage/v1/object/public/email-assets/email/1779981624021-rrugnj.png)

---

## What is next — the AI Founder's Bootcamp
Ready to go all in? **24 hours. 80 founders.** You walk out with a launched app for your business — not notes, an asset.

₱25,000 solo · ₱22,000 trio · ₱20,000 squad of 5. Reserve with a ₱10,000 downpayment (non-refundable).
[[Register for the AI Founder's Bootcamp]](https://www.bosslabs.live/founders-bootcamp)

---

## Questions? Just message us
Got a question? Send us a message on [our Facebook Page](https://www.facebook.com/profile.php?id=61589686430234) — **we don't use AI bots on the page. We personally read and reply to every message.**

See you there.`,
  },
  post_webinar_unpaid: {
    subject: "Your replay is inside, {{firstName}} — plus what comes next",
    body: `^^BOSSLABS AI · AI Vibe Coding 101^^
# Thanks for joining, {{firstName}}.

You showed up tonight — that already puts you ahead of most. Thank you for building with us.

## Your replay
Want to rewatch or catch what you missed? The full replay goes live on this link tomorrow morning:
[[Watch the replay]]({{replayUrl}})

## You saw what is possible
In one evening you watched real apps get built — no dev team, no months of waiting. Imagine what a full **24 hours** in the room could do for your business.

![Our AI Vibe Coding 101 event](https://placehold.co/1000x600/eef6fa/0093B8?text=Drop+your+event+photo+here)

---

## Your next step — the AI Founder's Bootcamp
**24 hours. 80 founders.** You walk out with a real, working app for your business — not notes, an asset.
[[Reserve your seat at the Bootcamp]](https://www.bosslabs.live/founders-bootcamp)

₱25,000 solo · ₱22,000 trio · ₱20,000 squad of 5. Seats are capped at 80. If you felt the pull tonight, do not sit on it.`,
  },
  facebook_group: {
    subject: "{{firstName}}, come join our Facebook community 💬",
    body: `^^BOSSLABS AI · Community^^
# Come build with us, {{firstName}} 🚀

There's a room where the real magic happens between events — and we'd love for you to be in it.

Our private Facebook community is where founders and builders learning AI vibe coding hang out: sharing wins, asking questions, swapping ideas, and shipping real apps together.

## What you'll get inside
A place to get unstuck when you're deep in a build. A front-row seat to what everyone else is creating. And first dibs on events, replays, and the **AI Founder's Bootcamp**.

And the best part? **Real humans — we don't use AI bots. We personally read and reply.**

[[Join the Facebook group]](https://www.facebook.com/share/g/18iYKmoNPc/)

---

See you inside, {{firstName}}!`,
  },
  oto_confirmation: {
    subject: "Your 1:1 Build Session is confirmed, {{firstName}}",
    body: `^^Payment received · 1:1 Build Session locked in^^

# You're in, {{firstName}}!

Your **1:1 Build Session with Kyle & Mikey** is confirmed. We received your payment of **{{amount}}** — thank you!

## What happens next

Kyle & Mikey will personally reach out to schedule your session at a time that works for you. Keep an eye on this email and your phone.

While you wait, come say hi in the BOSSLABS community:

[Join the Facebook group →](https://www.facebook.com/share/g/18iYKmoNPc/)

---

## Want to ship in 24 hours? Join the Bootcamp.

You've locked in your 1:1 — the natural next move is the **AI Founder's Bootcamp**: 24 hours, you walk out with a launched app. Only **80 seats** in the cohort.

₱25,000 solo · ₱22,000 trio · ₱20,000 squad of 5. Reserve with a ₱10,000 downpayment (non-refundable).

[[See the Bootcamp →]](https://www.bosslabs.live/founders-bootcamp)

Questions? Just reply to this email — we read every one.

— Mikey & Kyle`,
  },
  pw_orderbump: {
    subject: "{{firstName}}, you showed up. Now make it count 🔓",
    body: `^^You're in · Replay inside^^
# You showed up, {{firstName}}. Most don't.

That alone puts you ahead. Now let's make sure you actually **ship** — not "someday."

The fastest way is the **1:1 Build Session with Kyle & Mikey**: a private 1-hour call where we map your full AI integration roadmap, build out your app vision with you, and hand you the exact prompts to start coding in under 24 hours — the systems that claw back **₱100K+/month** for YOUR business.

Here's the catch — this is the **only** time you'll get it at the attendee price of **₱3,997** (normally ₱7,997). When your replay window closes, it goes back up.

[[Add my 1:1 Build Session — ₱3,997]](https://www.bosslabs.live/order-bump)

Ready for the bigger play? Join the **AI Founder's Bootcamp** — 24 hours, 80 seats only, you walk out with a launched app.
[[See the Bootcamp →]](https://www.bosslabs.live/founders-bootcamp)

— Mikee & Kyle`,
  },
};

const SMS = {
  pw_retreat_sms: {
    body: "BOSSLABS AI: {{firstName}}, the AI Founders Bootcamp — 24 hours to launch your app. 80 seats only. PHP 25k solo / 22k trio / 20k squad. Seats going fast: https://www.bosslabs.live/founders-bootcamp",
  },
  pw_lastcall_sms: {
    body: "BOSSLABS AI: Final call {{firstName}} — AI Founders Bootcamp (80 seats, 24-hour launch) + your PHP 3,997 1:1 Build Session both close now. Bootcamp: https://www.bosslabs.live/founders-bootcamp / Session: https://www.bosslabs.live/order-bump",
  },
  after_webinar_sms: {
    body: "Hi {{firstName}}! Thanks for joining AI Vibe Coding 101 🎉 Your replay + the app we built are in your email. Ready to launch your own in 24 hours? AI Founders Bootcamp: https://www.bosslabs.live/founders-bootcamp",
  },
};

let okEmails = 0;
for (const [id, patch] of Object.entries(EMAIL)) {
  const { error } = await sb.from('email_templates').update(patch).eq('id', id);
  if (error) console.error('email', id, '→', error.message);
  else { okEmails++; console.log('email', id, '✓'); }
}

let okSms = 0;
for (const [id, patch] of Object.entries(SMS)) {
  const { error } = await sb.from('sms_templates').update(patch).eq('id', id);
  if (error) console.error('sms', id, '→', error.message);
  else { okSms++; console.log('sms', id, '✓'); }
}

console.log(`\nDone. ${okEmails}/${Object.keys(EMAIL).length} emails, ${okSms}/${Object.keys(SMS).length} SMS.`);
