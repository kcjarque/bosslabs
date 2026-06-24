// Revamp the post-webinar PAID-attendee email drip with FOMO + ecom-billionaire
// framing + now-or-never urgency. Also appends a Facebook review CTA to every
// paid-attendee email so reviews compound BossLabs' reach.
//
// IDs in scope:
//   after_webinar          — immediate paid thank-you (top of funnel)
//   pw_orderbump           — 1:1 push (after-event +15h)
//   pw_orderbump2          — 1:1 closing scarcity (+27h)
//   pw_community           — FB founders group (+41h)
//   pw_retreat             — AI Founder's Bootcamp pitch (+65h)
//   pw_lastcall            — final dual close (+89h)
//   paid_confirmation      — instant after-payment receipt
//   oto_confirmation       — 1:1 Build Session confirmation
//   vault_confirmation     — AI Secrets Builder Vault confirmation
//   retreat_confirmation   — VCR payment receipt
//
// Renderer note: setting html='' so the lib/email.ts fallback re-renders the
// new markdown body on each send. (We learned this the hard way last time.)

import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const FB = 'https://www.facebook.com/bosslabsai/';

/** Reusable FB review CTA — appended to every paid email. Reach grows by
 *  reviews; reviews come from paid customers; ask while they're hot. */
const REVIEW_CTA = `

---

## 🙏 Help us reach more Filipino founders

We're on a mission to make every Filipino business tech-enabled — built by the boss, not bought from an agency. Every review pushes BossLabs in front of one more founder who needs to see this.

[[Leave us a quick review on Facebook →]](${FB})

30 seconds. One sentence. Massive impact on someone you'll never meet.`;

/* ---------------------------------------------------------------- */
/* Follow-up drip — FOMO + ecom billionaire framing                 */
/* ---------------------------------------------------------------- */

const EMAIL = {
  after_webinar: {
    subject: `{{firstName}}, you just saw the next ecom — don't sleep on it`,
    body: `^^BOSSLABS AI · The new ecom moment^^
# Thank you for joining, {{firstName}}!

Real talk: what you saw tonight is the **biggest founder opportunity of our lifetime.** Bigger than ecom 2010. Bigger than crypto 2017.

Remember Lazada in 2012? **₱120M revenue.** By 2016 they sold for **$1B.** The founders who jumped IN became billionaires. The ones who stayed on the side "thinking about it" — still thinking. The window opened, hindi sila pumasok, the window closed.

**AI in 2026 is that exact window — but bigger.** A solo Filipino founder with no dev team can now ship software faster than a 50-person agency. That's not a marketing line. You watched us prove it tonight. The first founders to claim this will own categories. Everyone else will rent from them.

## Your replay
The full replay will be ready on this link **tomorrow morning**:
[[Watch the replay]]({{replayUrl}})

## The app we built tonight — go play with it
[[Open the app we built]](https://anaya-ops.vercel.app)
![Anaya Ops — what we shipped tonight](https://hsbowpbuqlctxeglpqyd.supabase.co/storage/v1/object/public/email-assets/email/1782313163249-anaya-ops.png)

## What is next — ship YOUR app in 24 hours
**Now or never, {{firstName}}.** 80 founders. 24 hours. You walk out with a launched app for your business — an asset, not notes. **₱25,000 solo · ₱22,000 trio · ₱20,000 squad of 5.** Reserve with ₱10,000 (non-refundable — only commit if you're showing up).

[[Register for the AI Founder's Bootcamp]](https://www.bosslabs.live/founders-bootcamp)

The Filipinos who become billionaires in the AI decade are deciding right now. Tonight. Are you in?${REVIEW_CTA}

— Mikee & Kyle`,
  },
  pw_orderbump: {
    subject: `{{firstName}}, the Lazada founders didn't 'think about it' 🚪`,
    body: `^^You're in · Replay inside · Window closing^^
# You showed up, {{firstName}}. Most won't.

Quick story. **2012:** Lazada launches in PH. ₱120M revenue. **2016:** sold to Alibaba for **$1 billion.** The original investors and operators got rich. The Filipino entrepreneurs who said *"ecom? in PH? sounds risky"* are still saying it — about AI now.

History rhymes. You're standing in the AI version of 2012. The early operators win this decade. The "researchers" lose it.

The fastest way to be on the right side: the **1:1 Build Session with Kyle & Mikey.** One private hour, we map your full AI integration roadmap, build out your app vision, and hand you the exact prompts to start shipping in under 24 hours — the systems that claw back **₱100K+/month** for YOUR business.

This is the **only** time you'll get it at the attendee price of **₱3,997** (normally ₱7,997). When your replay window closes, it goes back up. **No exceptions.**

[[Add my 1:1 Build Session — ₱3,997]](https://www.bosslabs.live/order-bump)

Ready for the bigger play? Join the **AI Founder's Bootcamp** — 24 hours, you walk out with a launched app for your business. 80 seats only.
[[See the Bootcamp →]](https://www.bosslabs.live/founders-bootcamp)${REVIEW_CTA}

— Mikee & Kyle`,
  },
  pw_orderbump2: {
    subject: `{{firstName}}, ₱3,997 closes when your replay does — that's TONIGHT`,
    body: `^^Last call · Attendee price expires^^
# The window closes when your replay closes, {{firstName}}.

The early operators in every wave got rich. **Ecom 2010 → ₱billion Lazada/Shopee exits.** Crypto 2017 → quiet ₱millionaires you'll never meet. **AI 2026?** The boss who builds first owns the market. The boss who waits, rents from the boss who built.

We only run a handful of 1:1 Build Sessions each cohort. The **₱3,997 attendee price** disappears the moment your replay window closes.

In one hour we map your full AI integration roadmap, build out your app vision with you, and hand you the exact prompts to ship in under 24 hours.

[[Lock in my 1:1 Build Session before it's gone]](https://www.bosslabs.live/order-bump)

Once it's back to ₱7,997, that's the price. No exceptions. Don't be the founder telling this story to your kids who looked at AI and said *"maybe later."*

— Mikee & Kyle${REVIEW_CTA}`,
  },
  pw_community: {
    subject: `{{firstName}}, the next AI millionaire is already in this room`,
    body: `^^Your community · Where it gets real^^
# Don't build alone, {{firstName}}.

The Filipinos who got rich in ecom didn't do it solo. They had **rooms.** Closed circles where founders dropped wins, swapped what worked, and pulled each other up. The ones who built alone in 2012 are still building alone in 2026.

We run a **private BOSSLABS founders community** — where the cohort drops wins, swaps prompts, finds co-founders, and gets unstuck fast. **It's where the next opportunities get shared FIRST.** Before the public sees them.

The next Filipino AI millionaire is in there right now, building. Be in the same room.

[[Join the BOSSLABS Founders Group]](https://www.facebook.com/share/g/18iYKmoNPc/)

Come say hi — tell us what you're building.

— Mikee & Kyle${REVIEW_CTA}`,
  },
  pw_retreat: {
    subject: `{{firstName}}, launch your app in 24 hours — or watch competitors do it first`,
    body: `^^80 seats · Launch in 24 hours · Now or never^^
# This is the rarest opportunity in Filipino business history, {{firstName}}.

For the first time **ever**, a solo founder with no coding background can build production software in 24 hours. **The first time. Ever.** No agency. No dev team. No ₱500K bill.

If you'd done this in ecom 2010 you'd be running a ₱billion company today. The math is the same now — except the building is faster, the cost is lower, and the moat is shorter.

The window won't be open forever. Once your competitor's tools are already shipping, you don't get to be first.

The **AI Founder's Bootcamp** is where you ship. **24 hours.** You walk in with an idea, you walk out with a **launched app** for your business. Real, working, deployed.

**80 seats only.** Solo founders, founders bringing a co-pilot, or whole teams:
- 1 seat — **₱25,000**
- 3 seats — **₱22,000 each** (corporate trio, save ₱9,000)
- 5 seats — **₱20,000 each** (corporate squad, save ₱25,000)

Reserve with a **₱10,000 (non-refundable) downpayment** — only commit if you're showing up to ship.

[[See the Bootcamp + reserve a seat]](https://www.bosslabs.live/founders-bootcamp)

— Mikee & Kyle${REVIEW_CTA}`,
  },
  pw_lastcall: {
    subject: `Final call, {{firstName}} — the decade-defining decision is now`,
    body: `^^Final call · Two doors closing^^
# Two doors are closing, {{firstName}}.

Last shot. Let's be honest with each other.

The founders who watched ecom happen in slow motion and did nothing — they still feel that regret today, **15 years later.** Every time someone mentions Shopee or Lazada, that quiet "what if I had..." hits them.

You don't have to live that story twice. AI is *the* opportunity of this generation. Bigger window than ecom. Smaller barrier than crypto. Filipino-friendly. You're standing in it RIGHT NOW.

**Door 1 — The AI Founder's Bootcamp** · 80 seats, 24 hours to launch your app. The cohort is filling. If you've been on the fence, this is the moment.
[[Reserve your Bootcamp seat]](https://www.bosslabs.live/founders-bootcamp)

**Door 2 — Your ₱3,997 1:1 Build Session** · The attendee rate with Kyle & Mikey expires when your replay window closes. After that it's ₱7,997.
[[Add my 1:1 Build Session — ₱3,997]](https://www.bosslabs.live/order-bump)

Pick one. Pick both. But pick **today**. The decade-defining decisions don't wait for "kapag may oras."

Choose to **ship.** That's the whole point.

— Mikee & Kyle${REVIEW_CTA}`,
  },

  /* ---- Transactional confirmations get the review CTA only (no FOMO needed) ---- */

  paid_confirmation: {
    subject: `Ticket confirmed — see you on {{webinarDate}}`,
    body: `^^BOSSLABS AI · AI Vibe Coding 101^^
# You're in, {{firstName}}!

Payment received: **{{amount}}**. Your seat for **{{webinarDate}} at {{webinarTime}} {{webinarTimezone}}** is locked.

Your Zoom link:
[[Join the webinar]]({{zoomJoinUrl}})

Save this email — we'll send reminders, but this is your backup.

See you in the room.

— Mikee & Kyle${REVIEW_CTA}`,
  },
  oto_confirmation: {
    subject: `Your 1:1 Build Session is confirmed, {{firstName}}`,
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

— Mikey & Kyle${REVIEW_CTA}`,
  },
  vault_confirmation: {
    subject: `Your AI Secrets Builder Vault — payment confirmed, {{firstName}}`,
    body: `^^Payment received · Vault^^

# You're in, {{firstName}}!

Your **AI Secrets Builder Vault** is confirmed — payment of **{{amount}}** received. Thank you!

Inside the Vault:

- All past live build recordings — full end-to-end
- BossLabs AI-Flix — step-by-step tutorials (1-year access)
- The BossLabs Hub — prompts, skills & starter repos
- The 4-Step Vision-to-Reality App Blueprint

We'll send your access shortly — keep an eye on this inbox. Questions? Just reply to this email.

[Join the Facebook group →](https://www.facebook.com/share/g/18iYKmoNPc/)

— Mikey & Kyle${REVIEW_CTA}`,
  },
  retreat_confirmation: {
    subject: `Payment received — your VibeCode Retreat slot is reserved, {{firstName}}`,
    body: `^^Payment received · VibeCode Retreat^^

# You're in, {{firstName}}!

We've received your payment of **{{amount}}** for the **VibeCode Retreat** — your slot is reserved. 🎉

We'll send the full details (date, venue, schedule, and what to bring) soon. Keep an eye on this inbox.

Questions? Just reply to this email.

— Mikey & Kyle${REVIEW_CTA}`,
  },
};

let ok = 0, failed = 0;
for (const [id, patch] of Object.entries(EMAIL)) {
  const { error } = await sb.from('email_templates').update({ ...patch, html: '' }).eq('id', id);
  if (error) { console.error('✗', id, '→', error.message); failed++; }
  else { console.log('✓', id); ok++; }
}
console.log(`\nDone. ${ok}/${Object.keys(EMAIL).length} updated, ${failed} failed.`);
