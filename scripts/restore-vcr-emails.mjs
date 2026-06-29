// One-shot updater — restores VibeCode Retreat copy across the
// post-webinar email + SMS templates, with the new July 31 - August 1
// dates. Reverses scripts/update-bootcamp-emails.mjs (the Bootcamp
// idea has been retired).
//
// Transactional confirmations (paid_confirmation, vault_confirmation,
// retreat_reserved, retreat_confirmation) are deliberately untouched —
// they confirm purchases people already made.
//
// Usage:
//   pnpm exec node scripts/restore-vcr-emails.mjs
// or via npm:
//   node scripts/restore-vcr-emails.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
} catch {}

import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const RETREAT_URL = 'https://www.bosslabs.live/vibecode-retreat';
const ORDER_BUMP_URL = 'https://www.bosslabs.live/order-bump';
const FB_GROUP_URL = 'https://www.facebook.com/share/g/18iYKmoNPc/';

const EMAIL = {
  pw_retreat: {
    subject: "{{firstName}}, walk out with your app built — VibeCode Retreat",
    body: `^^10 seats · One Weekend · One Build^^
# Ready to actually build it, {{firstName}}?

The webinar showed you what's possible. The **VibeCode Retreat** is where you ship.

**One Weekend. One Build. 10 Founders.** July 31 – August 1, 2026 in Tagaytay. You walk in with an idea — you walk out with a **launched app** for your business. Premium villa, private chef, the founders building beside you.

**Only 10 seats.** First come, first served.

**Standard ₱60,000 · Pay-in-full ₱50,000 · ₱10,000 deposit to secure your seat.**

[[See the VibeCode Retreat + reserve your seat]](${RETREAT_URL})

— Mikee & Kyle`,
  },

  pw_lastcall: {
    subject: "Final call, {{firstName}} — Retreat + your 1:1 session",
    body: `^^Final call^^
# Two doors are closing, {{firstName}}.

**1. The VibeCode Retreat** — **10 seats only**, July 31 – August 1 in Tagaytay. One weekend, one build, you ship by Saturday. If you've been on the fence, this is the moment.

[[Reserve your Retreat seat]](${RETREAT_URL})

**2. Your ₱3,997 1:1 Build Session** — the attendee rate on the 1:1 Build Session with Kyle & Mikey is about to expire. After that it's ₱7,997.

[[Add my 1:1 Build Session — ₱3,997]](${ORDER_BUMP_URL})

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

## What is next — the VibeCode Retreat
Ready to go all in? **One weekend. One build. 10 founders.** July 31 – August 1 in Tagaytay. You walk in with an idea — you walk out with a **launched app** for your business.

Premium villa accommodation, private chef, the founders building beside you. **₱60,000 standard / ₱50,000 pay-in-full / ₱10,000 deposit.**
[[Reserve your seat at the Retreat]](${RETREAT_URL})

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
In one evening you watched real apps get built — no dev team, no months of waiting. Imagine what a full **weekend** in a Tagaytay villa with the founders building beside you could do for your business.

![Our AI Vibe Coding 101 event](https://placehold.co/1000x600/eef6fa/0093B8?text=Drop+your+event+photo+here)

---

## Your next step — the VibeCode Retreat
**One weekend. One build. 10 founders.** July 31 – August 1 in Tagaytay. You walk out with a real, working app for your business — not notes, an asset.

[[Reserve your seat at the Retreat]](${RETREAT_URL})

₱60,000 standard / ₱50,000 pay-in-full / ₱10,000 deposit. Seats are capped at 10. If you felt the pull tonight, do not sit on it.`,
  },

  facebook_group: {
    subject: "{{firstName}}, come join our Facebook community 💬",
    body: `^^BOSSLABS AI · Community^^
# Come build with us, {{firstName}} 🚀

There's a room where the real magic happens between events — and we'd love for you to be in it.

Our private Facebook community is where founders and builders learning AI vibe coding hang out: sharing wins, asking questions, swapping ideas, and shipping real apps together.

## What you'll get inside
A place to get unstuck when you're deep in a build. A front-row seat to what everyone else is creating. And first dibs on events, replays, and the **VibeCode Retreat**.

And the best part? **Real humans — we don't use AI bots. We personally read and reply.**

[[Join the Facebook group]](${FB_GROUP_URL})

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

[Join the Facebook group →](${FB_GROUP_URL})

---

## Want to ship in one weekend? Join the Retreat.

You've locked in your 1:1 — the natural next move is the **VibeCode Retreat**: one weekend in a Tagaytay villa, you walk out with a launched app. Only **10 seats** in the cohort, July 31 – August 1.

₱60,000 standard / ₱50,000 pay-in-full / ₱10,000 deposit to secure your seat.

[[See the Retreat →]](${RETREAT_URL})

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

[[Add my 1:1 Build Session — ₱3,997]](${ORDER_BUMP_URL})

Ready for the bigger play? Join the **VibeCode Retreat** — one weekend in Tagaytay, 10 seats only, you walk out with a launched app. July 31 – August 1.
[[See the Retreat →]](${RETREAT_URL})

— Mikee & Kyle`,
  },
};

const SMS = {
  pw_retreat_sms: {
    body: "BOSSLABS AI: {{firstName}}, the VibeCode Retreat — one weekend, you ship your app. 10 seats only, Jul 31-Aug 1 Tagaytay. PHP 60k / 50k pay-in-full / 10k deposit. " + RETREAT_URL,
  },
  pw_lastcall_sms: {
    body: "BOSSLABS AI: Final call {{firstName}} — VibeCode Retreat (10 seats, Jul 31-Aug 1 Tagaytay) + your PHP 3,997 1:1 Build Session both close now. Retreat: " + RETREAT_URL + " / Session: " + ORDER_BUMP_URL,
  },
  after_webinar_sms: {
    body: "Hi {{firstName}}! Thanks for joining AI Vibe Coding 101 🎉 Your replay + the app we built are in your email. Ready to ship YOUR app in a weekend? VibeCode Retreat Jul 31-Aug 1: " + RETREAT_URL,
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

console.log(`Done. ${okEmails}/${Object.keys(EMAIL).length} emails + ${okSms}/${Object.keys(SMS).length} sms updated.`);
