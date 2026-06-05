-- Post-webinar confirmation templates.
--
-- Problem: paid_confirmation / free_welcome hardcode "see you on {{webinarDate}}
-- · Join the Zoom call · {{zoomJoinUrl}}". When a payment or registration is
-- confirmed AFTER the webinar is over (recovered / late payments, or someone
-- registering off an old link), the buyer gets a dead Zoom link for a session
-- that already happened.
--
-- Fix: the senders (lib/webinar.ts → webinarIsOver) switch to these replay
-- variants once the event's start time + 3h has passed. Same vars, but they
-- point to the gated 7-day replay page ({{replayPageUrl}}) instead of Zoom.
--
-- html left '' so the app renders the markdown body through the BOSSLABS email
-- shell on the fly (see lib/email.ts renderEmail). on conflict do nothing so
-- admin edits in /admin/templates survive a migration re-run.

insert into email_templates (id, name, subject, html, body) values
('paid_confirmation_replay',
 'Paid Confirmation (Replay — post-webinar)',
 'You''re in, {{firstName}} — your BOSSLABS AI replay is ready',
 '',
 $$^^Payment received · Access unlocked^^

# Thanks, {{firstName}}.

Your BOSSLABS AI ticket is locked in. The live session has already wrapped — but everything you paid for is ready and waiting.

[[Watch the replay]]({{replayPageUrl}})

## What's included

7-day replay access (link above). Claude Code Skills pack (configs, prompts, and reusable skills). Founder Workflow Audit Checklist. BOSSLABS Community access (Facebook group + ongoing Q&A).

Join the BOSSLABS Facebook group for post-event Q&A and your next steps:

[Join the Facebook group →](https://www.facebook.com/share/g/18iYKmoNPc/)

— Mikee & Kyle$$
),
('free_welcome_replay',
 'Free Welcome (Replay — post-webinar)',
 'You''re in, {{firstName}} — watch the BOSSLABS AI replay',
 '',
 $$^^BOSSLABS AI · You're in^^

# Welcome, {{firstName}}.

You're registered for the BOSSLABS AI Webinar. The live session has already wrapped — but you can watch the full replay right now.

[[Watch the replay]]({{replayPageUrl}})

Unlock your Free Gift by joining our Facebook community:

[[Join the BOSSLABS Facebook group]](https://www.facebook.com/share/g/18iYKmoNPc/)

— Mikee & Kyle
BOSSLABS AI · Built in Manila$$
)
on conflict (id) do nothing;

insert into sms_templates (id, name, body) values
('paid_confirmation_replay',
 'Paid Confirmation (Replay)',
 'BOSSLABS AI: Payment received, {{firstName}}! The live session already wrapped — watch your replay here (7-day access): {{replayPageUrl}}'),
('free_welcome_replay',
 'Free Welcome (Replay)',
 'Hi {{firstName}}! You''re in for BOSSLABS AI. The live session already wrapped — watch the replay here: {{replayPageUrl}}')
on conflict (id) do nothing;
