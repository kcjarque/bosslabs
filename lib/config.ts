export const BRAND = {
  name: 'BOSSLABS AI',
  tagline: 'Command Centers for Businesses',
  cyan: '#00B8E6',
};

export const FOUNDERS = [
  {
    name: 'Mikey Manago',
    role: 'Co-Founder · Operator',
    bio: 'Ex-employee turned serial entrepreneur. Owns businesses in car detailing, real estate, healthcare, and more — every one built from zero with real customers, real cash, real outcomes. Came to AI for one reason: lower the cost of running a business so the operator wins. Lives in sales, relationships, and value creation.',
    shipped: ['Multi-business operator', 'Sales + relationships', 'Real PH revenue'],
    expertise: [
      { label: 'Sales & deals', value: 96 },
      { label: 'Operations', value: 92 },
      { label: 'Relationships', value: 95 },
    ],
  },
  {
    name: 'Kyle Jarque',
    role: 'Co-Founder · Engineer',
    bio: 'Industrial engineer by training. Marketer in FMCG, then operator in e-commerce, now builder in AI. Believes the advantage goes to business owners who become tech-enabled — not the ones who show off tech. Builds the tools, deploys the AI, ships the systems that actually work.',
    shipped: ['Industrial engineer', 'FMCG → e-com → AI', '5 production PH apps'],
    expertise: [
      { label: 'Claude Code', value: 96 },
      { label: 'Systems design', value: 94 },
      { label: 'Automation', value: 92 },
    ],
  },
];

export const WEBINAR = {
  name: 'AI Coding 101 — The BOSSLABS AI Webinar',
  promise:
    'How to use Claude Code to build apps, automations, and AI tools for your business — even with zero coding background.',
  /** Display strings. Wire real date in .env.local. */
  date: process.env.NEXT_PUBLIC_WEBINAR_DATE || 'To Be Announced',
  time: process.env.NEXT_PUBLIC_WEBINAR_TIME || '8:00 PM',
  timezone: process.env.NEXT_PUBLIC_WEBINAR_TZ || 'PHT',
  zoomRegisterUrl: process.env.NEXT_PUBLIC_ZOOM_REGISTER_URL || '',
  /** ISO date used by the countdown bar. Falls back to +14 days. */
  startsAtIso: process.env.NEXT_PUBLIC_WEBINAR_STARTS_AT_ISO || '',
};

/* --------------------------------------------------------------------- */
/* HERO — Headline formula:                                              */
/* "How to [outcome] using [mechanism] without [objection]"              */
/* --------------------------------------------------------------------- */
export const HEADLINE = {
  prefix: 'How to Build an Automated Business and Save at least',
  outcome: '₱100K/Month',
  outcomeTail: '',
  mechanismPrefix: 'Using',
  mechanism: 'Claude Code',
  objectionPrefix: 'Without',
  objection: 'Hiring a Single Developer',
};

export const SUBHEADLINE =
  'For Filipino business owners who are already running real businesses — but are stuck with manual workflows, expensive freelancers, and tools built for the US market.';

/* Authority / credibility bar — small claims, big trust. */
export const AUTHORITY = [
  { num: '24 hrs', label: 'Average build → ship time' },
  { num: '₱1M+', label: 'Average saved per business' },
  { num: '7 days', label: 'From zero to Claude Code master' },
];

/* --------------------------------------------------------------------- */
/* WHAT IS BOSSLABS AI — manifesto-style identity setting                */
/* --------------------------------------------------------------------- */
export const WHAT_IS = {
  eyebrow: 'What is BOSSLABS AI?',
  body: [
    'Most Filipino businesses are leaving real money on the table. Why? Manual workflows the team will never finish. ₱30K-a-month freelance developers who never deliver. Off-the-shelf tools built for the US market. The result: you do not scale — you just work more hours and hire more people.',
    'AI Coding flipped the script. In just 24 hours, a Filipino business owner can build a custom CRM, a customer-support agent, or an internal tool that replaces three full-time hires. You do not need a dev team. You just need the right system.',
    'Our mission is simple: every Filipino business, tech-enabled. Every owner with the power to ship their own tools. Every brand running on AI — built by the boss, not bought from an agency.',
  ],
  pullquote:
    'You already have the business. You already have the customers. Now you get the leverage. Do not waste this moment.',
};

/* --------------------------------------------------------------------- */
/* THE WORKFLOW — 6 steps from idea to shipped app                       */
/* --------------------------------------------------------------------- */
export const LAYERS = [
  {
    n: '01',
    name: 'Setup',
    desc: 'Claude Code installed, repo cloned, environment running — 15 minutes flat. No "should I learn Python first?" detours.',
  },
  {
    n: '02',
    name: 'Spec',
    desc: 'We teach you how to describe your business problem so the AI builds the right tool. The right prompts return working code.',
  },
  {
    n: '03',
    name: 'Build',
    desc: 'Claude Code writes the app. You review. No waiting on a developer, no Slack threads, no "I will get back to you tomorrow."',
  },
  {
    n: '04',
    name: 'Ship',
    desc: 'Deploy to Vercel or Supabase in one command. Live URL within the hour. You are the boss — not waiting on a dev team.',
  },
  {
    n: '05',
    name: 'Iterate',
    desc: 'Bug or new feature? Same loop. Same speed. The skill compounds every time you run it.',
  },
  {
    n: '06',
    name: 'Compound',
    desc: 'One app becomes three. Three becomes a system. Your business stops needing developers entirely — because now, you are the developer.',
  },
];

/* --------------------------------------------------------------------- */
/* TRAINING PILLARS — 3 branded names with outcomes                      */
/* --------------------------------------------------------------------- */
export const PILLARS = [
  {
    n: '01',
    brand: 'The 24-Hour Replacement',
    promise: 'How to Replace One Expensive Workflow Per Day in Your Business',
    body:
      'The exact loop we use every week — identify the workflow eating your team\'s time, build the AI replacement in one night, deploy it the next day. By the end of the webinar, you will have shipped your first one live.',
  },
  {
    n: '02',
    brand: 'The Replacement Math',
    promise: 'How to Cut Your Tech Bill by 80% and Reclaim 40 Hours a Week',
    body:
      'The math behind why most Filipino businesses are over-paying for SaaS subscriptions and freelance devs. We show you which line items to kill and which to keep — then walk through the exact stack that replaces all of it for less than the cost of one team lunch.',
  },
  {
    n: '03',
    brand: 'The Founder Multiplier',
    promise: 'How to Stop Being Your Business\'s Bottleneck and Start Shipping at Startup Speed',
    body:
      'The mindset shift behind why operators with zero developer background are out-shipping their own engineering teams. Even if you have never written code, this section turns you into a builder by the end of the night.',
  },
];

/* --------------------------------------------------------------------- */
/* MEET YOUR HOST                                                        */
/* --------------------------------------------------------------------- */
export const HOST = {
  name: 'Mikey Manago & Kyle Jarque',
  shortName: 'Mikey & Kyle',
  story:
    'Two Filipino operators who got tired of getting quoted ₱500K and 6-month timelines for apps we could ship ourselves. We taught ourselves Claude Code, built our entire stack — CRM, HR portal, AI agents — one night per tool, then started teaching what we learned. Today, 3,000+ Filipino business owners have followed the same playbook.',
  credentials: [
    'Founders of BOSSLABS AI · Command Centers for Filipino Businesses',
    'Shipped 12+ production apps using Claude Code in 2025 alone',
    'Trained 3,000+ Filipino operators in AI coding workflows',
    'Building tools used by businesses across Manila, Cebu, Davao',
  ],
};

/* --------------------------------------------------------------------- */
/* FREE GIFT — the lead magnet that makes the opt-in valuable            */
/* --------------------------------------------------------------------- */
export const FREE_GIFT = {
  name: 'The Claude Code Skills Pack',
  worth: '₱4,997 value',
  bullets: [
    'Reusable Claude Code Skills (sales, ops, hiring, content)',
    '4 starter repos — CRM, HR portal, booking tool, AI agent',
    'The exact 24-hour build workflow we use every week',
    'BOSSLABS Community access (Messenger + ongoing Q&A)',
  ],
  unlockNote:
    'Register + join the BOSSLABS Messenger Community to unlock. Delivered the moment you join.',
};

/* --------------------------------------------------------------------- */
/* STUDENT WINS — keep to max 10                                         */
/* --------------------------------------------------------------------- */
export const WINS = [
  {
    quote:
      'Shipped my agency\'s internal CRM in 2 days. Saved ₱200K on what would have been a custom build.',
    name: 'Marco Reyes',
    detail: 'Agency Founder · Manila · After 60 days',
    result: '₱200K saved',
    category: 'agency' as const,
  },
  {
    quote:
      'I was the bottleneck on every project. Built our intake AI agent in one weekend. Team finally moves without me.',
    name: 'Trisha Lim',
    detail: 'E-commerce CEO · Cebu · After 30 days',
    result: 'Built in 1 weekend',
    category: 'ecom' as const,
  },
  {
    quote:
      'Replaced our 3-person ops team with one AI workflow. Saved ₱45K/month and we ship more, not less.',
    name: 'Karl Santos',
    detail: 'B2B SaaS Founder · Quezon City · After 90 days',
    result: '₱45K/mo saved',
    category: 'saas' as const,
  },
  {
    quote:
      'Started with zero coding background. Now I run my whole booking system on a Claude Code build I made myself.',
    name: 'Bianca Cruz',
    detail: 'Wellness Studio Owner · BGC · After 45 days',
    result: 'Owns own stack',
    category: 'studio' as const,
  },
  {
    quote:
      'Got quoted ₱350K by a local dev shop for an app I built in 4 days using what they taught.',
    name: 'Ethan Castro',
    detail: 'Retail Operator · Davao · After 30 days',
    result: '₱350K saved',
    category: 'retail' as const,
  },
  {
    quote:
      'Built our HR portal, payroll automation, and a Messenger bot in one month. My VAs are now 4x more productive.',
    name: 'Joel Mendoza',
    detail: 'Co-Founder · Outsourcing · Pasig · After 60 days',
    result: '4× productivity',
    category: 'bpo' as const,
  },
];

export type WinCategory = 'agency' | 'ecom' | 'saas' | 'studio' | 'retail' | 'bpo';

/* --------------------------------------------------------------------- */
/* PRICING (used in /checkout, /oto — NOT shown on opt-in page)          */
/* --------------------------------------------------------------------- */
export const OFFER = {
  main: {
    sku: 'BL_WEBINAR_LIVE',
    name: 'BOSSLABS AI — AI Coding 101 (Live Webinar)',
    priceCentavos: 99900,
    currency: 'PHP',
    label: '₱999',
    crossed: '₱2,997',
  },
  bonus: {
    title: 'Free Tools Stack — included',
    items: [
      'Claude Code Skills pack (configs, prompts, and reusable skills)',
      'Founder Workflow Audit Checklist',
      '7-day Zoom replay access',
      'BOSSLABS Community access (Messenger + ongoing Q&A)',
    ],
  },
  oto: {
    sku: 'BL_OTO_AUDIT',
    name: 'One-on-One AI Integration Audit',
    priceCentavos: 199700,
    currency: 'PHP',
    label: '₱1,997',
    crossed: '₱4,997',
    promise:
      'A private 45-minute call with Mikey or Kyle. We audit your business, find the ₱100K+ of monthly leaks AI can close, and map your first 3 apps to build. You walk away with a custom integration plan — not a course.',
    inclusions: [
      'Live 45-min 1:1 call (Zoom) with Mikey or Kyle',
      'Custom AI Integration Map — top 3 apps for YOUR business',
      'Workflow leak audit — exact ₱amount you can reclaim',
      'Implementation roadmap (priority order, week-by-week)',
      'Recording + written summary delivered within 2 business days',
      'Priority queue for follow-up questions for 30 days',
    ],
  },
};

/* --------------------------------------------------------------------- */
/* OUR APPS — real production apps built by the BOSSLABS founders        */
/* using Claude Code. Used by the OurAppsShowcase section.               */
/* --------------------------------------------------------------------- */
export type AppShowcase = {
  slug: string;
  name: string;
  business: string;
  tagline: string;
  hint: string; // visual interest line shown like a URL bar
  primary: string; // tailwind-like color slug used in the card header
  accent: string; // hex used for inline visuals
  metric: { value: string; label: string };
  detail: { value: string; label: string };
  built: string;
  /** Optional. Drop a file at /public/apps/<slug>.png to use a real screenshot. */
  screenshot?: string;
};

export const OUR_APPS: AppShowcase[] = [
  {
    slug: 'station-five',
    name: 'Station Five',
    business: 'Car detailing operations',
    tagline: 'Full ops dashboard — orders, bays, revenue, payroll.',
    hint: 'stationfive.ph/overview',
    primary: 'bg-orange-500/15 border-orange-500/40',
    accent: '#F97316',
    metric: { value: '₱48,249', label: 'May revenue · 6 jobs' },
    detail: { value: '14% bays', label: '2 of 14 occupied' },
    built: 'Shipped in 7 days',
    screenshot: '/apps/station-five.png',
  },
  {
    slug: 'solarmaxx',
    name: 'SolarMaxx',
    business: 'Solar installer · operations console',
    tagline: 'Live SolaxCloud tickets, sales pipeline, system health.',
    hint: 'console.solarmaxx.ph',
    primary: 'bg-amber-400/15 border-amber-400/40',
    accent: '#FBBF24',
    metric: { value: '3/3', label: 'Systems online · 100% uptime' },
    detail: { value: '3.2h', label: 'Avg ticket response' },
    built: 'Shipped in 1 week',
    screenshot: '/apps/solarmaxx.png',
  },
  {
    slug: 'bm-hub',
    name: 'BM Hub · Ads Command',
    business: 'Marketing agency · Conex Media',
    tagline: 'Per-ad scoring + lifecycle tags for client campaigns.',
    hint: 'bmhub.conexmedia.ph/ads',
    primary: 'bg-rose-500/15 border-rose-500/40',
    accent: '#F43F5E',
    metric: { value: '74', label: 'Winner score · ₱11K spend' },
    detail: { value: '10/10', label: 'CTX + SCORED coverage' },
    built: 'Shipped in 1 weekend',
    screenshot: '/apps/bm-hub.png',
  },
  {
    slug: 'flowbot',
    name: 'FlowBot',
    business: 'AI chatbot for Filipino SMEs',
    tagline: 'Messenger flows with CTA triggers + pain-point branches.',
    hint: 'flowbot.ph/setter-ai',
    primary: 'bg-emerald-500/15 border-emerald-500/40',
    accent: '#10B981',
    metric: { value: '8 steps', label: 'Setter AI Test Run · live' },
    detail: { value: 'Live preview', label: 'Trigger → close in one flow' },
    built: 'Shipped in 24 hours',
    screenshot: '/apps/flowbot.png',
  },
  {
    slug: 'taskman',
    name: 'TaskMan',
    business: 'Personal + team task system',
    tagline: 'Capture, calendar, meetings, org boards — one app.',
    hint: 'taskman.app/today',
    primary: 'bg-teal-500/15 border-teal-500/40',
    accent: '#14B8A6',
    metric: { value: '14 / 8', label: 'Pending · ongoing today' },
    detail: { value: '58 done', label: 'This quarter · personal + org' },
    built: 'Shipped in 3 days',
    screenshot: '/apps/taskman.png',
  },
];

/* --------------------------------------------------------------------- */
/* MESSENGER / Lead-capture defaults                                     */
/*                                                                       */
/* Set NEXT_PUBLIC_MESSENGER_GROUP_URL in env, or override live from     */
/* /admin/settings (settings.messengerGroupUrl wins at request time).    */
/* Empty string here on purpose — surfaces hide the CTA when no URL is   */
/* configured rather than shipping a 404 link.                            */
/* --------------------------------------------------------------------- */
export const MESSENGER_GROUP_URL =
  process.env.NEXT_PUBLIC_MESSENGER_GROUP_URL || '';

/* Facebook community group — where we now funnel signups (replaces the
 * old Messenger group). Override via env; defaults to the live group. */
export const FACEBOOK_GROUP_URL =
  process.env.NEXT_PUBLIC_FACEBOOK_GROUP_URL || 'https://www.facebook.com/share/g/18iYKmoNPc/';

export function formatPHP(centavos: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
  }).format(centavos / 100);
}
