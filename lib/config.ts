export const BRAND = {
  name: 'BOSSLABS AI',
  tagline: 'Command Centers for Businesses',
  cyan: '#00B8E6',
};

export const FOUNDERS = [
  {
    name: 'Mikey Manago',
    photo: '/mikey.jpg',
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
    photo: '/kyle.jpg',
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
  'Create real systems in less than 24 hours. No coding experience. No developer required. And the best part? Hindi hao shao — boss, hindi ito marketing-marketing lang, this is the real system na hinahanap mo.';

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
    'Bawal ang hao shao. AI is not just about marketing — at hindi ’yan puro prompts tapos marketing-marketing. Yuck. The opportunity is right here, right now — pero most people don’t even see the GOLD MINE behind AI. Kasi iba’t ibang guru at agency ang naglilito kung ano ba talaga ang REAL VALUE nito.',
    'Imagine building the BEST PRODUCT, the BEST VALUE, and the BEST OPERATIONS in your business — all at once. That’s the FULL POTENTIAL of AI na hindi mo pa na-uunlock. Literally, hawak mo na ang World’s Best Developer — a genius sitting right beside you, 24/7, ready to build kung ano man ang kailangan ng business mo.',
    'Our mission is simple: every Filipino business, tech-enabled — built by the boss, hindi binili sa agency. I want to CHANGE the way you see AI. Hindi ’to tungkol sa more sales lang o puro prompts — it’s about creating REAL CHANGE sa takbo ng business mo.',
  ],
  pullquote:
    'Wag mo ’ko paniwalaan — here are the actual SYSTEMS our students have built for their own businesses.',
};

/* --------------------------------------------------------------------- */
/* THE VISION-TO-REALITY FRAMEWORK — 5 steps to ship                     */
/* --------------------------------------------------------------------- */
export const LAYERS = [
  {
    n: '01',
    name: 'Prompt',
    desc: 'Get your idea in place — describe what you want to build in plain language.',
  },
  {
    n: '02',
    name: 'MVP',
    desc: 'Drop it in Claude Code. It builds your first working version, fast.',
  },
  {
    n: '03',
    name: 'Testing',
    desc: 'Check if it works, then keep improving until it does.',
  },
  {
    n: '04',
    name: 'Launch',
    desc: 'Connect all the pieces together and ship it live.',
  },
  {
    n: '05',
    name: 'Feedback Loop',
    desc: 'Check again that everything works — then refine and repeat.',
  },
];

/* --------------------------------------------------------------------- */
/* TRAINING PILLARS — 3 branded names with outcomes                      */
/* --------------------------------------------------------------------- */
export const PILLARS = [
  {
    n: '01',
    brand: 'Everyone Is Wrong About AI',
    promise: 'The truth: it’s not about prompts — and definitely not marketing-marketing',
    body:
      'Most gurus sell you prompts and “marketing-marketing.” That’s hao shao. The real value of AI is building systems that run your business — better product, better operations, better value your competitors can’t copy. We show you what AI is actually for.',
  },
  {
    n: '02',
    brand: 'Bawal Ang Hao Shao',
    promise: 'Live demo — watch a real system get built right in front of you',
    body:
      'No theory, no recycled slides, walang drama. We build a real, working system LIVE so you see exactly how it’s done — start to finish. Bawal ang hao shao: kung hindi namin maipakita, hindi namin ibebenta.',
  },
  {
    n: '03',
    brand: 'You Don’t Need a Developer',
    promise: 'You need the right VISION — and you can ship it in under 24 hours',
    body:
      'You don’t need to hire engineers or learn how to code. You need the right vision — AI becomes your developer. Hawak mo na ang World’s Best Developer, kaya kahit zero coding background, you can ship a real system in less than 24 hours. Built by the boss, hindi binili sa agency.',
  },
];

/* --------------------------------------------------------------------- */
/* STUDENT BUILDS — real, live apps built with students in past webinars */
/* Shared by the homepage proof cards, checkout proof, and exit popups.  */
/* --------------------------------------------------------------------- */
export const STUDENT_BUILDS = [
  {
    name: 'EstateConnect',
    tag: 'Real-estate agent assignment & live chat',
    img: '/realestate-app.png',
    url: 'https://realestate-kappa-liard.vercel.app/',
  },
  {
    name: 'Sentinel',
    tag: 'Real-time security operations platform',
    img: '/preclarus-app.png',
    url: 'https://preclarus-app.vercel.app/',
  },
  {
    name: 'Bescost Ops',
    tag: 'Signage ops — job orders, production & billing',
    img: '/bescost-ops.png',
    url: 'https://bescost-ops.vercel.app/',
  },
  {
    name: 'Meaningful Travels',
    tag: 'PH heritage tours — booking, guide field console & feedback',
    img: '/meaningful-travels.png',
    url: 'https://meaningful-travels.vercel.app/',
  },
  {
    name: 'Anaya',
    tag: 'At-home massage booking — therapists arrive at your door',
    img: '/anaya-ops.png',
    url: 'https://anaya-ops.vercel.app/',
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
    // SKU unchanged so payment/webhook/tracking keep matching — only the
    // displayed offer + price changed (now ₱999, down from ₱1,997).
    sku: 'BL_OTO_AUDIT',
    name: 'The AI Secrets Builder Vault',
    priceCentavos: 99900,
    currency: 'PHP',
    label: '₱999',
    crossed: '₱9,997',
    eyebrow: 'Bonus',
    discountLabel: '90% off',
    savings: 'Save ₱8,998',
    footerNote: '⚡ Get instant access upon payment',
    promise:
      'Everything we use to ship apps fast: every past live build recorded end-to-end, our growing step-by-step tutorial library, the prompts + skills + starter-repo hub, and the exact vision-to-app blueprint. Instant access — this page only.',
    inclusions: [
      'All live past build recordings — full end-to-end (EstateConnect, Sentinel, Bescost Ops…)',
      'BossLabs AI-Flix — step-by-step tutorials, growing weekly · 1-year access',
      'The BossLabs Hub — exclusive prompts, skills & starter repos',
      '4-Step Vision-to-Reality App Blueprint',
    ],
    // Value-stack breakdown for the OTO page — sums to the crossed ₱9,997.
    valueStack: [
      { label: 'All live build recordings — full end-to-end', value: '₱4,000' },
      { label: 'BossLabs AI-Flix — tutorials, 1-year access', value: '₱3,000' },
      { label: 'The BossLabs Hub — prompts, skills & repos', value: '₱2,000' },
      { label: '4-Step Vision-to-Reality App Blueprint', value: '₱997' },
    ],
    totalValue: '₱9,997',
  },
  // Second order bump — the original 1:1 founder session, now ₱3,997.
  oto2: {
    sku: 'BL_OTO_1ON1',
    name: '1:1 Build Session with Kyle & Mikey',
    priceCentavos: 399700,
    currency: 'PHP',
    label: '₱3,997',
    crossed: '₱7,997',
    eyebrow: 'Action Taker Bonus',
    discountLabel: '50% off',
    savings: 'Save ₱4,000',
    footerNote: '📅 Book your 1:1 right after the webinar',
    promise:
      'A 1-hour exclusive 1:1 call with the founders — we map your full AI integration roadmap, scope out your MVP, and hand you the exact prompts to start coding in under 24 hours.',
    inclusions: [
      '1-hour exclusive 1:1 call with Kyle & Mikey',
      'Your full AI integration roadmap',
      'We map out your MVP',
      'The exact prompts to start coding',
      'Get your project started in under 24 hours',
    ],
    // Value-stack breakdown for the OTO page — sums to the crossed ₱7,997.
    valueStack: [
      { label: '1-hour 1:1 call with Kyle & Mikey', value: '₱5,000' },
      { label: 'Your full AI integration roadmap', value: '₱1,500' },
      { label: 'We map out your MVP', value: '₱1,000' },
      { label: 'Exact prompts + 24-hour start plan', value: '₱497' },
    ],
    totalValue: '₱7,997',
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

/* Monitor recipients — every sequence/drip email also gets sent to these so
 * the team can see exactly what registrants receive, for ANY event, without
 * being fake signups (which would pollute paid/abandoned/revenue metrics).
 * One copy per step fire, email only.
 *
 * Default empty: most sequences are battle-tested now, and the volume of
 * "checking" copies became noisy in the founders' inboxes. Re-enable by
 * setting DRIP_MONITOR_EMAILS=kyle@x.com,mikey@x.com in Vercel env when
 * monitoring is needed (e.g. when revamping a sequence). */
export const MONITOR_EMAILS = (process.env.DRIP_MONITOR_EMAILS || '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

export function formatPHP(centavos: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
  }).format(centavos / 100);
}

/** Whole-peso format for headline aggregate cards. formatPHP shows ".80"
 *  when there are actual cents, which pushes a total like ₱1,322,892.80 past
 *  the width of a 5-col KPI card and clips the trailing zero. On aggregates
 *  the centavos are noise anyway — use this for revenue/income/spend totals,
 *  keep formatPHP for individual invoice amounts and funnel prices where the
 *  cents are real. */
export function formatPHPWhole(centavos: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(centavos / 100);
}
