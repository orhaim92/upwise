# UpWise

> Personal household cashflow management app.
> Hebrew-only, RTL. Private use — not a public product.

**Tagline:** ניהול חשבונות. שליטה. צמיחה.

This is **Phase 1**: foundation only — Next.js 16 + Auth.js v5 + Drizzle + Neon Postgres + RTL UI shell. No bank scraping, no transactions, no dashboard data yet. Subsequent phases extend this.

---

## Local setup

### 1. Clone

```bash
git clone https://github.com/orhaim92/upwise.git
cd upwise
npm install
```

(`.npmrc` sets `legacy-peer-deps=true` so installs work despite `next-auth@beta`'s stale Next 14/15 peer-dep range.)

### 2. Get `DATABASE_URL` from Vercel → Neon

The Neon Postgres database is already connected to the `upwise` Vercel project. Pull the env vars locally:

**Option A — Vercel CLI (recommended):**

```bash
npx vercel link        # one-time: link this folder to the upwise Vercel project
npx vercel env pull .env.local
```

This will overwrite `.env.local` with the real `DATABASE_URL` (and any other Vercel env vars).

**Option B — manual copy:**

1. Go to https://vercel.com/orhaim92/upwise/stores
2. Click the `neon-violet-desert` Neon database
3. Open the `.env.local` tab
4. Copy `DATABASE_URL` and paste it into `.env.local` here, replacing the placeholder.

### 3. Generate `AUTH_SECRET`

A dev value is committed in `.env.local`. Regenerate yours:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

For production, add the value as `AUTH_SECRET` in **Vercel → Settings → Environment Variables**.

### 4. Apply schema to Neon

```bash
npm run db:push
```

This applies `drizzle/0000_premium_spirit.sql` (creates `users`, `households`, `household_members`).

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>.

---

## What works

- `/` — landing page with brand gradient + login/signup CTAs
- `/signup` — name + email + password (≥12 chars). On success, creates user + household + admin membership in one transaction, auto-signs in, redirects to `/dashboard`.
- `/login` — email + password, JWT session (7-day TTL).
- `/dashboard` — empty shell, auth-required. Shows "ברוך הבא, {name}".
- Logout button in the header signs out and returns to `/`.
- `proxy.ts` (Next 16's renamed middleware) protects all non-public routes.
- Hebrew RTL throughout, Rubik font.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16.2.4** (App Router, Turbopack default) |
| UI | **Tailwind v4** + **shadcn/ui** (RTL enabled, `@base-ui/react`) |
| Database | **Neon Postgres** (Vercel integration) |
| ORM | **Drizzle ORM** + `drizzle-kit` |
| Auth | **Auth.js v5** (`next-auth@beta`) — Credentials provider, JWT sessions |
| Password hashing | **bcryptjs** (12 rounds) |
| Forms | **react-hook-form** + **zod** |
| Icons | **lucide-react** |
| Deploy | **Vercel Hobby** |

---

## Project structure

```
upwise/
├── src/
│   ├── app/
│   │   ├── (auth)/                 # /login, /signup
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── (app)/                  # authenticated app shell
│   │   │   ├── layout.tsx
│   │   │   └── dashboard/page.tsx
│   │   ├── api/auth/
│   │   │   ├── [...nextauth]/route.ts
│   │   │   └── signup/route.ts
│   │   ├── layout.tsx              # RTL <html dir="rtl">, Rubik font
│   │   ├── page.tsx                # landing
│   │   └── globals.css
│   ├── components/ui/              # shadcn (button, card, input, label, sonner)
│   ├── lib/
│   │   ├── auth/{config,password}.ts
│   │   ├── db/{index,schema}.ts
│   │   ├── i18n/he.ts              # all Hebrew strings (single source)
│   │   ├── validations/auth.ts     # Zod schemas
│   │   └── utils.ts
│   └── types/next-auth.d.ts
├── public/
│   ├── logo.svg                    # full lockup (placeholder — replace with original)
│   └── logo-icon.svg               # icon-only (placeholder — replace with original)
├── drizzle/
│   └── 0000_premium_spirit.sql     # initial migration
├── proxy.ts                        # Next 16 middleware (renamed from middleware.ts)
├── drizzle.config.ts
├── components.json                 # shadcn config (rtl: true)
├── .npmrc                          # legacy-peer-deps=true
├── .env.example
└── README.md
```

---

## Deploy to Vercel

The repo is already linked to the `upwise` Vercel project. Push to `main`:

```bash
git add .
git commit -m "Phase 1: foundation"
git push origin main
```

Before the first deploy works in production, add `AUTH_SECRET` to Vercel:

1. Go to https://vercel.com/orhaim92/upwise/settings/environment-variables
2. Add `AUTH_SECRET` for Production + Preview, value generated via the command above.

`DATABASE_URL` is already set by the Neon integration.

---

## Conventions for future phases

- **All user-facing strings** go through `src/lib/i18n/he.ts`. Don't hardcode Hebrew in components.
- **Tailwind logical properties only** for spacing/positioning: `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`. **Never** `ml-*`, `mr-*`, `left-*`, `right-*` — they break in RTL.
- **Zod at every API boundary** (Server Action, Route Handler, webhook payload).
- **No `any`.** Use `unknown` or generics.
- **RSC by default**, `'use client'` only when needed (forms, interactivity).
- **No raw SQL string concat** — Drizzle only.
- New PR with a new table? RLS-equivalent check at the query layer + a Playwright cross-tenant test.

---

## Phase status

- [x] **Phase 1** — Foundation (this)
- [ ] **Phase 2** — Manual transactions, categories, CSV import
- [ ] **Phase 3** — Bank integration (israeli-bank-scrapers + Inngest)
- [ ] **Phase 4** — Recurring detection + savings + cycle math + dashboard
- [ ] **Phase 5** — WhatsApp digest (Twilio sandbox)
- [ ] **Phase 6** — AI Advisor Lite (single Claude call, behind feature flag)
- [ ] **Phase 7** — Polish (a11y, perf, mobile, onboarding)
