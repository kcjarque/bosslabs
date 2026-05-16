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

### 1. Provision Supabase (one-time)

Required because Vercel's filesystem is ephemeral — the JSON fallback won't persist signups between requests.

1. Create a project at [supabase.com](https://supabase.com/dashboard)
2. Open **SQL Editor → New query**, paste the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and Run
3. Copy from **Settings → API**:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **`service_role` secret** → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose to client)

### 2. Connect the repo + set env vars

1. **Import** `kcjarque/bosslabs` into Vercel (Next.js auto-detected, no `vercel.json` needed)
2. **Environment Variables** (Production):
   ```
   ADMIN_PASSWORD                   <your strong password>
   ADMIN_COOKIE_SECRET              <long random string>
   NEXT_PUBLIC_SITE_URL             https://your-domain.com
   NEXT_PUBLIC_WEBINAR_DATE         <real date>
   NEXT_PUBLIC_WEBINAR_TIME         8:00 PM
   NEXT_PUBLIC_WEBINAR_TZ           PHT
   NEXT_PUBLIC_WEBINAR_STARTS_AT_ISO 2026-06-14T20:00:00+08:00
   NEXT_PUBLIC_SUPABASE_URL         <from Supabase>
   SUPABASE_SERVICE_ROLE_KEY        <from Supabase>
   ```
   Leave `XENDIT_SECRET_KEY` blank to keep checkout in demo mode until you wire it.
3. Deploy.

### 3. Configure runtime tokens

Open `https://your-domain.com/admin/login`, sign in, then **Settings**:
- Paste your Resend API key + From email/name
- Paste your OneWaySMS username/password + Sender ID
- Paste your Zoom register/join URLs + Messenger group URL

These persist in Supabase (the `settings` table), so they survive deploys.

### Dev vs. production storage

The app picks the storage backend at runtime:

| Env vars set? | Backend |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | **Supabase** (real DB) |
| Neither set | **JSON files** in `/data/` (dev only) |

This means local dev works with **zero setup** (file fallback), and Vercel uses Supabase automatically once env vars are set.

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
