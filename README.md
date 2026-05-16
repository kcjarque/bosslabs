# BOSSLABS AI — Webinar Funnel + Mini Backend

Next.js 14 · TypeScript · Tailwind v3. Public funnel + admin CRM in one repo.

## Public funnel

| Route | What |
|---|---|
| `/` | Opt-in landing (editorial dark, "How to build an automated business…") |
| `/checkout` | Reactive total · order bump (₱1,997) · Xendit |
| `/oto` | Last-Chance OTO when bump skipped · "Smart move" confirmation when bumped |
| `/thank-you` | Paid confirmation + onboarding form |
| `/registered` | Free-registration thank-you with Messenger lock |
| `/contact` · `/privacy` · `/terms` | Standard legal + contact |

## Admin (mini CRM)

| Route | What |
|---|---|
| `/admin/login` | Single shared password (env var `ADMIN_PASSWORD`, default `bosslabs`) |
| `/admin` | Dashboard — stat tiles + delivery-channel status + recent signups |
| `/admin/signups` | Searchable / filterable list · per-signup send-template drawer · CSV export |
| `/admin/email-templates` | 5 seeded templates · HTML preview · test send via Resend |
| `/admin/sms-templates` | 5 seeded templates · live char + part counter · test send via OneWaySMS |
| `/admin/settings` | Configure Resend, OneWaySMS, Zoom URLs, Messenger group URL |

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev   # http://localhost:3000
```

Login at `/admin/login` with password `bosslabs` (or whatever you set as `ADMIN_PASSWORD`).

## Env vars

```bash
# Required
ADMIN_PASSWORD=
ADMIN_COOKIE_SECRET=                 # any long random string

# Webinar — used by landing-page countdown + templates
NEXT_PUBLIC_WEBINAR_DATE=To Be Announced
NEXT_PUBLIC_WEBINAR_TIME=8:00 PM
NEXT_PUBLIC_WEBINAR_TZ=PHT
NEXT_PUBLIC_WEBINAR_STARTS_AT_ISO=   # ISO timestamp the countdown ticks to

# Public site URL — used for Xendit success/failure redirects
NEXT_PUBLIC_SITE_URL=

# Xendit — leave blank to run checkout in demo mode (skips real API, jumps to OTO)
XENDIT_SECRET_KEY=
XENDIT_WEBHOOK_TOKEN=
```

Resend API key, OneWaySMS credentials, Zoom URLs, and Messenger group URL are configured **at runtime** through `/admin/settings`, not env vars.

## Deploy to Vercel

1. **Set required env vars** in the Vercel dashboard (the block above)
2. **Connect the repo + deploy** — no `vercel.json` needed, Next.js auto-detects
3. **Important**: Vercel's serverless filesystem is **ephemeral**. The `/data/*.json` storage works on a single-instance VPS but won't persist between deploys on Vercel.

### Swap the JSON storage for a real DB before high traffic

All read/write goes through [`lib/db.ts`](lib/db.ts) — ~12 functions. To swap to Supabase / Postgres / Vercel KV:

1. Replace the bodies of `getSignups`, `addSignup`, `updateSignup`, `getEmailTemplates`, `saveEmailTemplate`, `getSmsTemplates`, `saveSmsTemplate`, `getSettings`, `saveSettings`
2. Everything else (admin UI, public forms, send routes) stays exactly the same

The seed templates in `data/email_templates.json` + `data/sms_templates.json` are committed — port them into your DB at migration time.

## Brand

- Pure dark · cyan `#00B8E6` editorial accent
- `Instrument Serif` for headlines · `Inter` for body · `Orbitron` for the logo wordmark only
- Admin pages flip to a white dashboard theme via [`app/admin/admin.css`](app/admin/admin.css)
- DNA-helix vibe replaced with subtle dotted-grid + breathing orbs (`HeroBackground`, `PageGlow`)

## File map

- [`app/`](app) · public + admin routes + API
- [`components/`](components) · UI components (HeroBackground, AppsStack, TerminalMockup, StarterPackMockup, OurAppsShowcase, admin forms)
- [`lib/`](lib) · `config.ts` (all copy), `db.ts` (storage), `email.ts` (Resend), `sms.ts` (OneWaySMS), `xendit.ts`, `admin-auth.ts`
- [`data/`](data) · seeded email + SMS templates (committed) · signups + settings (gitignored)
