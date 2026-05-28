# Receipt Intelligence AI

AISB's receipt → journal-entry scanner. Photograph a receipt or invoice on your
phone, get a balanced IFRS/GAAP journal entry, line items, and (where a real
Barbados-local source exists) a price comparison. Exports to Excel.

Built on the AISB SaaS stack: Next.js 14 (App Router) + Prisma + Neon Postgres
+ Auth.js v5 magic-link, deployed on Render. Productionization of the Google
AI Studio prototype "Image to Journal Entry AI V.1" (Gemini 3 Flash).

**Status:** scaffolding — app shell only. See
[PR #1 (Productionization Plan)](https://github.com/JP-Billionz/Invoice-Receipt-Intelligence/pull/1)
for the full build sequence.

---

## Local development

Prerequisites: Node 20+, a Neon Postgres database (free tier is fine), a
SendGrid account with a verified sender, and a Gemini API key.

```bash
# 1. Install dependencies (must include devDependencies so Prisma + TS are available)
npm install

# 2. Copy and fill in env vars
cp .env.example .env.local
# Edit .env.local — every variable is required, see comments in the file

# 3. Generate the Prisma client and run migrations
npx prisma generate
npx prisma migrate deploy

# 4. Start the dev server
npm run dev
```

App will be available at <http://localhost:3000>. The home page redirects to
`/login` (magic-link request) when unauthenticated, or `/scan` when signed in.

## Architecture

See [`docs/01-PRODUCTIONIZATION-PLAN.md`](docs/01-PRODUCTIONIZATION-PLAN.md) for
the full plan — file layout, Prisma schema, where the price-comparison
guardrails live, PWA setup, and the `render.yaml` outline.

## Non-negotiables (from the kickoff)

1. **API keys are server-side only.** Gemini, SendGrid, database. Never
   `NEXT_PUBLIC_*`. All third-party calls go through Next.js API routes.
2. **The price comparison never invents values.** If no real Barbados source is
   returned by Gemini's Google Search grounding, the comparison is `null` —
   never an estimate, approximation, or non-local fallback. Electricity and
   water line items are skipped entirely without ever calling Gemini.
3. **Plan PR before bulk code changes.** Recon → markdown plan → alignment →
   then code, in small focused PRs.

## Deploy

`render.yaml` is a Render Blueprint — point Render at this repo, set the
`sync: false` secrets in the dashboard, and it deploys. All six AISB
Render-deploy lessons are baked in (see comments in `render.yaml`).
