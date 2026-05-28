# Receipt Intelligence AI — Productionization Plan

**Status:** ✅ Approved by Cowork 2026-05-28. All §3 open questions resolved
in §4. Three design additions from review incorporated into §2 and recorded
in §5. Code PRs proceed strictly sequentially per Cowork's instruction —
each PR builds + deploys + smoke-tests before the next opens.
**Source of truth:** `_Business/Receipt-Intelligence-AI/SCOPE-MVP.md` (2nd Brain workspace).
**Prototype baseline:** merged to `main` as "v0 — AI Studio baseline" per §4.1.

This is the markdown-only Plan PR requested in the kickoff. It captures (1) what the
prototype does today, (2) the proposed structure for the Next.js port, (3) open
questions Cowork answered in review, (4) the resolutions, and (5) the design
additions to incorporate before any code PR opens.

---

## 1. Recon — what the prototype actually does

**Stack today:** React 19 + TypeScript + Vite 6 + Tailwind via CDN + SheetJS via CDN.
Gemini SDK loaded in the browser via `esm.sh`. ~2700 lines across 27 files. No tests.
No backend. State lives in component memory + `localStorage`.

### 1.1 Gemini integration (`services/geminiService.ts`)

Two browser-side functions, both `gemini-3-flash-preview`:

- **`analyzeReceipt(base64, mimeType)`** — JSON-mode call with a strict
  `responseSchema`. Sends `inlineData` image part + a system prompt that encodes
  the accrual rules (invoice → AP credit; receipt → Bank/Cash credit). Wraps in
  `withRetry` (exponential backoff on 429 / RESOURCE_EXHAUSTED). Friendly error
  mapping for rate-limit / safety blocks.
- **`analyzeReceiptForPriceComparison(base64, mimeType)`** — `tools:
  [{googleSearch: {}}]`, free-text response that's best-effort JSON-parsed (handles
  ` ```json ` fences and `[...]` fuzzy match), then stitches the first N
  `groundingMetadata.groundingChunks[].web` URIs onto the parsed items **by
  index** (i.e. first item gets first source — fragile if order shifts).

### 1.2 Extraction schema

```
vendor                   : string
transactionDate          : "YYYY-MM-DD"
documentNumber           : string ("N/A" if missing)
vatAmount                : number
vatRate                  : "20%" | "15%" | "Unknown" | ...
expenseCategory          : "Office Supplies" | "Travel" | "Utilities" |
                           "Marketing" | "Professional Services" | "Equipment" |
                           "Food & Beverage" | "Other"
subtotal                 : number
totalAmount              : number
isInvoice                : boolean
entries[]                : { account, debit, credit, description }
lineItems[]              : { description, quantity, unitPrice, total }
```

`lineItems` is `required` in the schema but optional in `types.ts:38` — minor
inconsistency to fix on port.

### 1.3 Journal-entry construction

The model does the work. The prompt encodes:

1. `isInvoice` classification from the document itself.
2. **Accrual rule:** invoice → credit `Accounts Payable`/`Trade Creditors` (never
   Bank/Cash); receipt → credit `Bank`/`Cash`/`Credit Card Payable` per visible
   payment method.
3. VAT extracted as its own debit line to `GST/VAT Paid` / `Input Tax`.
4. Total debits must equal total credits (model is trusted; UI warns if
   `|debits − credits| > 0.01`).
5. "Standard account names" — **chart of accounts is not pinned**, so vendor
   naming drifts across receipts. Mapping AISB's actual COA is a tuning step.

Client-side post-processing in `App.tsx:74` and **duplicated** in
`JournalEntryTable.tsx:14` (same algorithm in two places): the "Ignore VAT" toggle
removes tax lines and redistributes the tax debit pro-rata across expense lines,
appending "(Includes Tax)" to descriptions, keeping the entry balanced.

### 1.4 Price-comparison UI

Rendered at `App.tsx:933` inside the `'comparison'` tab via
`components/PriceComparisonTable.tsx`. Columns: Item / Price Paid / Comparable
Product (with clickable source link) / Online Price (with up/down arrow vs paid).
The empty-state copy is already "No comparable products were found…" — so the UI
correctly handles a blank result. The **prompt + post-processing** are what need
rewriting.

### 1.5 Other notable surface area

| Area | Notes |
|------|-------|
| `App.tsx` | 967-line single-component state machine — single/bulk/folder-watcher modes, queue with `processingRef` lock, client-side dedup, Excel export, tab routing. Will fragment cleanly across Next.js page + client components. |
| `FolderWatcher.tsx` | File System Access API — Chrome/Edge desktop only. Won't work on iOS PWA. **Recommend keeping as desktop-only escape hatch behind a capability check.** |
| `lib/analytics.ts` | Pure `localStorage`, 500-row ring buffer. Must move to Postgres for multi-tenant. |
| PDF input | Already supported (`accept="image/*,application/pdf"`) — Gemini handles. |
| Camera capture | Already present (`capture="environment"` on the mobile "Take Photo" button at `FileUpload.tsx:63`). Port verbatim. |
| Excel format | **Single:** Analysis Summary / Journal Entries / CSV Export Data / Detailed Line Items. **Bulk:** Bulk Summary / Combined Journals / Combined Line Items. Preserve verbatim per kickoff §9. |
| Duplicate dedup | Normalized `documentNumber` match within the in-memory queue. **Per session only** — re-uploading the same receipt next week wouldn't catch it. |

### 1.6 Recon-discovered issues (productionization must fix)

| # | Issue | Where | Priority |
|---|-------|-------|----------|
| 1 | Gemini API key shipped to client bundle | `vite.config.ts:13–15`, `index.html:19–28` | **Hardline blocker** |
| 2 | Price comparison invents `source: '#'` when grounding empty | `services/geminiService.ts:262` | **Hardline blocker** |
| 3 | No Barbados constraint, no utilities exclusion | `services/geminiService.ts:213–216` | **Scope §2 blocker** |
| 4 | No persistence (in-memory + localStorage only) | system-wide | Plan step 3 |
| 5 | Duplicate dedup is per-session, client-side | `App.tsx:186–208` | Move to server, tenant-scoped |
| 6 | `index.html` charset typo `UTF-M` and missing `/index.css` | `index.html:5,29` | Gone after Next.js port |
| 7 | `getAccountingEntries` duplicated in `App.tsx` and `JournalEntryTable.tsx` | both files | Extract to shared `lib/` on port |
| 8 | Hardcoded `'en-US' / 'USD'` formatting | `JournalEntryTable.tsx:78`, etc. | Respect tenant currency (BBD likely) |
| 9 | `lineItems` required-in-schema vs optional-in-types | `types.ts:38` vs `geminiService.ts:143` | One-line fix |
| 10 | Sources stitched **by index** — first item always gets first source | `geminiService.ts:258–265` | Rewrite as part of the comparison guardrails work |

---

## 2. Proposed structure for the Next.js port

### 2.1 Repository layout

```
app/
  (auth)/
    login/page.tsx              # magic-link request form
    verify/page.tsx             # post-click verify landing
  (app)/                        # authenticated shell
    layout.tsx
    scan/
      page.tsx                  # main scanner UI (ports prototype's two-column layout)
      [scanId]/page.tsx         # individual scan detail
    scans/
      page.tsx                  # records list (search/filter by date, vendor, amount, account)
    analytics/page.tsx
  api/
    auth/[...nextauth]/route.ts
    scan/
      route.ts                  # POST: upload + start extraction
      [scanId]/route.ts         # GET: poll status/result
      [scanId]/comparison/route.ts   # POST: trigger comparison; GET: poll
      [scanId]/excel/route.ts        # GET: single-scan Excel download
    scans/
      bulk-excel/route.ts       # POST: bulk Excel download for selected scan IDs
    analytics/route.ts          # GET: aggregated per-tenant stats
  layout.tsx                    # root layout, PWA <link>s
  manifest.ts                   # Next 14 metadata route → web manifest
components/
  scanner/
    FileUpload.tsx              # ported, camera capture preserved
    QueueList.tsx               # ported, reads server state via SWR/React Query
    JournalEntryTable.tsx       # ported (display-only; balance logic moved to lib/)
    LineItemTable.tsx           # ported
    PriceComparisonTable.tsx    # ported, blank-aware (it already is)
    AnalyticsDashboard.tsx      # ported, fetches /api/analytics
    FolderWatcher.tsx           # ported, behind capability check (desktop Chrome/Edge only)
  ui/                           # shared primitives
lib/
  gemini/
    client.ts                   # server-side GoogleGenAI singleton (lazy)
    extract.ts                  # ported analyzeReceipt + withRetry + error mapping
    comparison.ts               # NEW — Barbados-grounded, fail-closed (§2.3)
    schema.ts                   # responseSchema (extracted from prototype)
    prompts.ts                  # both system prompts in one place for tuning
  accounting/
    balance.ts                  # getAccountingEntries (deduplicated from App.tsx + JournalEntryTable.tsx)
  excel/
    single.ts                   # 4-sheet workbook builder (preserve prototype format)
    bulk.ts                     # 3-sheet workbook builder
  db/
    client.ts                   # PrismaClient singleton
  storage/                      # NEW (§5.1 — Cowork addition) — image-blob abstraction
    index.ts                    # ImageStorage interface { put, get, delete }
    postgres.ts                 # MVP impl: Scan.fileBlob (Postgres bytea)
    r2.ts                       # FUTURE: Cloudflare R2 adapter — swap without app changes
  tenant/                       # NEW (§5.2 — Cowork addition)
    settings.ts                 # Zod schema for Tenant.settings (COA mapping, defaults)
    index.ts                    # server-side tenant resolution helper
  ratelimit/                    # NEW (§5.3 — Cowork addition)
    tenant.ts                   # per-tenant Gemini token bucket (one tenant cannot
                                # exhaust the shared key for others)
  auth.ts                       # NextAuth v5 config (custom createUser → Tenant transaction)
  utilities-check.ts            # isUtilityLineItem() — used by comparison guardrails
prisma/
  schema.prisma
  migrations/
public/
  icons/                        # PWA icons (192, 512, maskable)
__tests__/
  lib/gemini/comparison.test.ts # required by kickoff §6 — "no source → blank" path
  lib/gemini/comparison-utilities.test.ts  # confirms electricity/water never call Gemini
  lib/accounting/balance.test.ts
render.yaml
next.config.js
tailwind.config.js
postcss.config.js               # CJS — per render lesson #2
.env.example
```

### 2.2 Prisma schema sketch

Multi-tenant from day one, indexed by `tenantId` everywhere. Decimals stored as
`Decimal(14, 4)` for currency precision.

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  emailVerified DateTime?
  image         String?
  tenantId      String
  tenant        Tenant    @relation(fields: [tenantId], references: [id])
  accounts      Account[]
  sessions      Session[]
  scans         Scan[]    @relation("UploadedBy")
  createdAt     DateTime  @default(now())
  @@index([tenantId])
}

model Tenant {
  id        String   @id @default(cuid())
  name      String
  // §4.6: per-tenant default. Scan.currency overrides per-scan when extracted.
  currency  String   @default("BBD")
  // §5.2: validated via lib/tenant/settings.ts Zod schema on every read/write.
  // Shape: { coaMapping?: Record<string,string>, defaultExpenseAccount?: string, ... }
  settings  Json?
  users     User[]
  scans     Scan[]
  createdAt DateTime @default(now())
}

enum ScanSource { SINGLE BULK FOLDER_WATCHER }
enum ScanStatus { PENDING SCANNING DONE ERROR DUPLICATE_DETECTED EXCLUDED }

model Scan {
  id                String     @id @default(cuid())
  tenantId          String
  tenant            Tenant     @relation(fields: [tenantId], references: [id])
  uploadedById      String
  uploadedBy        User       @relation("UploadedBy", fields: [uploadedById], references: [id])
  source            ScanSource
  status            ScanStatus
  fileName          String
  mimeType          String
  // §4.7: image bytes stored INLINE on the row (Postgres bytea) for MVP — Render
  // free has no persistent disk. Read/written via lib/storage/ abstraction so the
  // Cloudflare R2 swap is a backend-only change. Excluded from default SELECTs
  // (large; only fetched by GET /api/scan/[scanId]/image).
  fileBlob          Bytes?
  // Extracted (mirror JournalData)
  vendor            String?
  transactionDate   DateTime?
  documentNumber    String?    // normalized form (alnum, uppercase) for dedup
  documentNumberRaw String?
  vatAmount         Decimal?   @db.Decimal(14, 4)
  vatRate           String?
  expenseCategory   String?
  subtotal          Decimal?   @db.Decimal(14, 4)
  totalAmount       Decimal?   @db.Decimal(14, 4)
  isInvoice         Boolean?
  // §4.6: per-scan currency override. Null = use Tenant.currency. Gemini
  // extraction populates this when a currency code is visible on the document.
  currency          String?
  // Dedup / error state
  duplicateOfId     String?
  duplicateOf       Scan?      @relation("Duplicates", fields: [duplicateOfId], references: [id])
  duplicates        Scan[]     @relation("Duplicates")
  errorMessage      String?
  processingTimeMs  Int?
  journalEntries    JournalEntry[]
  lineItems         LineItem[]
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt
  @@index([tenantId])
  @@index([tenantId, transactionDate])
  @@index([tenantId, documentNumber])   // tenant-scoped cross-session dedup
  @@index([tenantId, vendor])
}

model JournalEntry {
  id          String   @id @default(cuid())
  scanId      String
  scan        Scan     @relation(fields: [scanId], references: [id], onDelete: Cascade)
  tenantId    String                                    // denormalized for fast tenant queries
  account     String
  debit       Decimal  @db.Decimal(14, 4)
  credit      Decimal  @db.Decimal(14, 4)
  description String
  position    Int                                       // preserve original order
  @@index([tenantId])
  @@index([scanId])
}

model LineItem {
  id          String       @id @default(cuid())
  scanId      String
  scan        Scan         @relation(fields: [scanId], references: [id], onDelete: Cascade)
  tenantId    String
  description String
  quantity    Decimal      @db.Decimal(14, 4)
  unitPrice   Decimal      @db.Decimal(14, 4)
  total       Decimal      @db.Decimal(14, 4)
  position    Int
  comparison  Comparison?
  @@index([tenantId])
  @@index([scanId])
}

// CRITICAL: per-LineItem; nullable price; required source URL when price is non-null.
// Migration adds a CHECK constraint: (comparablePrice IS NULL) OR (sourceUrl IS NOT NULL)
model Comparison {
  id                String   @id @default(cuid())
  lineItemId        String   @unique
  lineItem          LineItem @relation(fields: [lineItemId], references: [id], onDelete: Cascade)
  tenantId          String
  comparablePrice   Decimal? @db.Decimal(14, 4)        // null = no Barbados source found
  comparableProduct String?
  comparableVendor  String?
  sourceUrl         String?                            // MUST be set when comparablePrice non-null
  sourceTitle       String?
  searchedAt        DateTime                           // we always record the attempt
  skipped           Boolean  @default(false)           // true for electricity/water — never called Gemini
  skipReason        String?
  @@index([tenantId])
}

// NextAuth standard models — Account, Session, VerificationToken — mirror invoicer exactly.
```

**Note on the DB-level check:** a Postgres `CHECK` constraint
`(comparablePrice IS NULL OR sourceUrl IS NOT NULL)` is added in the first migration
so the DB itself rejects "price without source" rows. Belt-and-braces alongside the
app-level validation in `lib/gemini/comparison.ts`.

### 2.3 Where the price-comparison guardrails live

**Single file: `lib/gemini/comparison.ts`.** Pure function, easy to test.

```ts
type ComparisonResult =
  | { kind: 'skipped'; reason: 'utility' | 'no-source' }
  | { kind: 'found'; price: number; product: string; vendor: string;
      sourceUrl: string; sourceTitle: string; searchedAt: Date };

export async function runComparison(lineItem: LineItem): Promise<ComparisonResult>
```

Flow:

1. **Utilities check (no Gemini call).** `lib/utilities-check.ts` matches description
   against `/(electric(ity)?|water|utility|light bill|water bill)/i`. Match → return
   `{ kind: 'skipped', reason: 'utility' }`. **Persisted with `skipped: true`** so
   we never re-try.
2. **Gemini call with Barbados-grounded prompt.** Prompt explicitly says "Barbados
   retailers only" and lists a short allowlist of known BB sources (see open Q).
   `tools: [{googleSearch: {}}]`, structured response.
3. **Locality validation.** Every returned `groundingChunks[].web.uri` is checked
   against: (a) `.bb` TLD, OR (b) an env-configured allowlist of BB retailer domains.
   Any source failing both checks is discarded.
4. **No surviving Barbados source → blank.** Return `{ kind: 'skipped', reason:
   'no-source' }`. **Persisted with `comparablePrice: null, sourceUrl: null,
   searchedAt: <now>`** — we record the attempt so the UI can show "we looked, found
   nothing" rather than "we never tried".
5. **Source–item pairing.** Replace the prototype's fragile by-index stitching: the
   model must return a `sourceUrl` per item in its structured output, and we
   verify that URL appears in the call's `groundingChunks` before accepting.
6. **Unit tests** (required by kickoff §6):
   - `comparison.test.ts` — mock Gemini to return zero groundingChunks → assert
     result is `{ kind: 'skipped', reason: 'no-source' }`, **never** a hallucinated
     price.
   - `comparison.test.ts` — mock Gemini to return only non-`.bb` non-allowlist
     sources → same skipped result.
   - `comparison-utilities.test.ts` — pass an electricity line item → assert
     Gemini is **never called** (mock not invoked), result is `{ kind: 'skipped',
     reason: 'utility' }`.

### 2.4 PWA setup

- `app/manifest.ts` — Next 14 metadata route producing the web manifest:
  - `name: "Receipt Intelligence AI"`, `short_name: "Receipts AI"`
  - `theme_color` / `background_color` — **TBD per open Q on brand colours**
  - `icons` — 192, 512, maskable (sourced from invoicer brand or new)
  - `display: "standalone"`, `start_url: "/scan"`
- Service worker via `next-pwa` (preferred) or hand-rolled registration in
  `app/layout.tsx`. **App shell + static assets cached; API routes explicitly
  bypassed** (`networkOnly` strategy for `/api/*`) — kickoff §7: don't cache API
  responses, fresh data matters.
- Camera capture: prototype's `<input accept="image/*" capture="environment">`
  ports verbatim — it's already in `FileUpload.tsx:63`.
- Install-prompt verification on Android Chrome happens during deploy plumbing
  (Lighthouse PWA audit on the Render preview URL).

### 2.5 `render.yaml` outline

All six render lessons baked in.

```yaml
services:
  - type: web
    name: receipt-intelligence
    runtime: node
    plan: free
    region: oregon
    branch: main
    buildCommand: npm install --include=dev && npx prisma generate && npx prisma migrate deploy && npm run build
    startCommand: npm run start
    envVars:
      - key: NODE_VERSION
        value: "20"
      - key: AUTH_TRUST_HOST            # lesson #4 — in render.yaml, NOT dashboard-only
        value: "true"
      - key: DATABASE_URL               # Neon Postgres connection string
        sync: false
      - key: NEXTAUTH_SECRET
        sync: false
      - key: NEXTAUTH_URL
        sync: false
      - key: SENDGRID_API_KEY
        sync: false
      - key: EMAIL_FROM                 # §4.5: "AISB Receipts AI <jp@aisolutionsbb.com>"
        sync: false
      # §5.3 — per-tenant Gemini token bucket settings. Defaults baked in;
      # override here to tighten/loosen without a redeploy.
      - key: GEMINI_RATE_LIMIT_PER_MINUTE
        value: "60"
      - key: GEMINI_RATE_LIMIT_BURST
        value: "10"
      - key: GEMINI_API_KEY             # server-side only — never NEXT_PUBLIC_*
        sync: false
      - key: BB_RETAILER_ALLOWLIST      # comma-separated domains for comparison locality check
        sync: false
```

Companion `package.json` rules (lessons #1, #3):

- `tailwindcss`, `postcss`, `autoprefixer` under `dependencies` (not
  `devDependencies`).
- `postcss.config.js` as **CJS**, not `.mjs`.
- Build command explicitly installs devDependencies (`--include=dev`) because
  Render sets `NODE_ENV=production`.

### 2.6 Build sequence (matches scope §"Build sequence")

> **Sequential per Cowork's instruction.** Each step opens ONE PR, merges,
> deploys, smoke-tests before the next step opens. No parallel stacking
> until the foundation is verified on Render.

1. **App shell** — Next.js scaffold, Prisma + Neon connection, Auth.js v5
   magic-link, custom `createUser` → Tenant transaction. **Includes the §5
   additions** (lib/storage, lib/tenant/settings Zod, lib/ratelimit/tenant,
   `currency` + `fileBlob` on Scan, EMAIL_FROM concrete) so the foundation is
   complete on first deploy. **First deploy to Render on this alone**,
   smoke-test login + DB write of a Tenant + User pair.
2. **Port the scanner** — `lib/gemini/extract.ts` from
   `services/geminiService.ts` (extraction schema includes `currency` per
   §4.6); UI components into `app/(app)/scan/`. Move the journal-balance
   algorithm to `lib/accounting/balance.ts` (deduplicated).
3. **Persistence — ASYNC** (per §5.4). `POST /api/scan` validates + stores
   the image via lib/storage, creates a `Scan` with `status: PENDING`, kicks
   off extraction in an unawaited Promise, and **returns `{ scanId }`
   immediately**. The client polls `GET /api/scan/[scanId]` until `status`
   transitions to `DONE` / `ERROR` / `DUPLICATE_DETECTED`. Render free tier
   30s request limit + Gemini latency would time out a synchronous flow.
   Records list page lands here too.
4. **Local comparisons** — `lib/gemini/comparison.ts` per §2.3. Tests first,
   then wire into `POST /api/scan/[scanId]/comparison`. UI hides the
   comparison column for utility line items and shows "—" for `no-source`
   skips with a tooltip "Searched, no local Barbados source found".
5. **PWA** — manifest (`theme_color: '#9BD850'`, `background_color: '#0A0716'`
   per AISB brand — see `reference-aisb-brand` memory), service worker, camera
   capture verification. Lighthouse audit ≥ 90 PWA score.
6. **Internal pilot** — feed real AISB receipts through, tune extraction +
   COA mapping. Depends on §4.2 (Jamai provides COA) and §4.3 (Jamai provides
   3–5 sample receipts).

---

## 3. Open questions

### 3.1 Should the prototype baseline be merged to `main`?

The `prototype-import` branch sits on origin. Three options, recommend (a):

- **(a) Merge `prototype-import` → `main` as the first commit** (call it
  "v0 — AI Studio baseline"), then each subsequent PR replaces files in place.
  Clearest history; diff per PR shows exactly what's changing.
- **(b) Keep `prototype-import` as a reference branch**, never merged; build the
  new app on `main` from an empty starting point. Cleaner final repo but loses
  blame trail to original AI Studio code.
- **(c) `git cp` selected files** (`services/geminiService.ts`, `types.ts`,
  components) into the new structure with attribution in commit messages. Most
  surgical but most manual.

### 3.2 AISB's accounting system / chart of accounts

The prototype trusts Gemini to pick "standard account names" — which means vendor
naming drifts. To pin the COA we need to know:

- Which system AISB books in today (QuickBooks Online, Xero, Sage, custom Excel)?
- Can you share the COA export (CSV is fine) or the list of accounts used in
  practice for ~10 common expense buckets (office supplies, travel, meals,
  utilities, professional services, equipment, marketing, software/SaaS, fuel,
  freight)?
- Default expense account when the model can't classify confidently?

Not a blocker for steps 1–5. Required before step 6 tuning.

### 3.3 Sample receipts

3–5 real AISB receipts/invoices placed in `samples/` on `main`. Will use them to:

- Verify extraction quality across local vendor formats.
- Tune the COA mapping (3.2).
- Build the comparison guardrails test fixtures (replay real grounding responses).

Not a blocker for steps 1–5.

### 3.4 Barbados retailer allowlist (initial set)

For the comparison locality check (§2.3 step 3), what should the initial allowlist
be? Proposal — confirm or replace:

- `.bb` TLD (always trusted)
- `pricesmart.com` (Barbados outlet)
- `massystoresbb.com`
- `carltonbarbados.com` (or whatever the current domain is)
- `popular.bb`
- `automotiveart.com` (BB office)
- Local newspaper classifieds: `nationnews.com`, `barbadostoday.bb`?

Final list goes in `BB_RETAILER_ALLOWLIST` env var (so it's editable in the Render
dashboard without a deploy). Names you want me to start with?

### 3.5 EMAIL_FROM branding

Three options:

- **(a)** `AISB Invoicer <jp@aisolutionsbb.com>` — reuse exactly, but the product
  isn't the invoicer.
- **(b)** `AISB Receipts AI <jp@aisolutionsbb.com>` (recommend).
- **(c)** Something else — but it must match a SendGrid verified sender.

### 3.6 Currency

Prototype hardcodes USD throughout. Three options:

- **(a)** Hardcode BBD everywhere (simplest; correct for AISB internal use).
- **(b)** Per-tenant currency (already in schema as `Tenant.currency` default
  `"BBD"`).
- **(c)** Detect currency from the receipt itself (Gemini extracts a currency
  code) and display in that — most accurate but most complexity.

Recommend (b): default BBD per tenant, with an override field on Scan if Gemini
detects a different currency on the document.

### 3.7 Image retention

Two options:

- **(a)** Store the uploaded image (small blob storage on Render or Neon) so users
  can re-export / re-process / audit. Costs storage + raises privacy surface area.
- **(b)** Discard after extraction; store only the structured data. Cheapest +
  smallest privacy footprint, but no re-OCR if extraction was wrong.

Recommend (a) for AISB internal pilot — auditability matters more than cost at
this scale. Easy to flip to (b) later via a tenant setting.

### 3.8 Folder Watcher feature

The prototype's `FolderWatcher.tsx` uses the File System Access API — desktop
Chrome/Edge only, won't work on iOS PWA, can't run server-side.

- **(a)** Port verbatim, gated behind a capability check (desktop browser only).
  Useful for batch reconciliation at the AISB desk.
- **(b)** Replace with a server-side polled inbox (e.g. send receipts to a
  dedicated email or drop them in S3) — bigger lift, more useful long-term.
- **(c)** Drop for MVP, revisit after pilot.

Recommend (a) for MVP — preserves a feature the prototype already has at near-zero
extra effort, gated behind a clear "Desktop browser only" UI banner.

### 3.9 Brand colors

Kickoff §7 says "use the existing AISB green/purple brand colours — match the
invoicer". I don't have the invoicer's exact hex codes on disk. Could you paste
the relevant tailwind config values or the PWA manifest `theme_color` / 
`background_color` from the invoicer repo?

---

## 4. Cowork review — resolutions (2026-05-28)

Cowork reviewed §3 and resolved every open question. Code PRs proceed strictly
sequentially per Cowork's instruction: each PR builds + deploys + smoke-tests
before the next opens.

### 4.1 ✅ Resolved — option (a)

**Merge `prototype-import` → `main` as "v0 — AI Studio baseline" first.** Done
before the app-shell PR opens, so subsequent PRs cleanly replace prototype
files in place and the diff per PR shows exactly what's changing.

### 4.2 ⏸ Deferred to step 6

Jamai provides the AISB chart of accounts + accounting system before the
internal pilot starts. Steps 1–5 proceed without it.

### 4.3 ⏸ Deferred to step 6

Jamai provides 3–5 real sample receipts in `samples/` before the pilot.

### 4.4 ✅ Resolved — use the proposed design

The design in §2.3 (env-var allowlist + `.bb` TLD always trusted + locality
check before accepting any source) is approved. Jamai sends the initial
retailer list separately; it goes in `BB_RETAILER_ALLOWLIST` in the Render
dashboard.

### 4.5 ✅ Resolved — option (b)

`EMAIL_FROM = "AISB Receipts AI <jp@aisolutionsbb.com>"`. Must match the
SendGrid verified sender.

### 4.6 ✅ Resolved — option (b) + extraction schema change

Per-tenant default `Tenant.currency = "BBD"` (already in schema). Added
**`Scan.currency`** column for per-scan override when the document shows a
different currency. The Gemini extraction `responseSchema` adds a `currency`
field (ISO 4217 code, optional — null means "fall back to tenant default")
populated by the extractor when visible on the document.

### 4.7 ✅ Resolved — option (a) with abstraction

Keep images, **but stored as Postgres `bytea`** on `Scan.fileBlob` for MVP —
Render free tier has no persistent disk and S3/R2 setup is overhead we don't
need yet. All reads/writes go through **`lib/storage/` abstraction**
(`ImageStorage.put / get / delete`) with a `postgres` adapter for MVP and a
ready-to-implement `r2` adapter for the swap. Migrating to R2 is a
backend-only change — no app-code rewrites.

Scan responses do NOT include `fileBlob` by default (large; only fetched via
`GET /api/scan/[scanId]/image`).

### 4.8 ✅ Resolved — option (a)

Port `FolderWatcher` behind a desktop-capability check (`showDirectoryPicker
in window`). Shows a "Desktop browser only" banner on iOS/mobile. Lands in
a later PR — not blocking the app-shell PR.

### 4.9 ✅ Resolved — colors located

Extracted from `_Business/AISB-Invoicer-SaaS/reference-current-app/index V.1.html`.
Saved to memory as `reference-aisb-brand`. Core palette:

- Background: `#0A0716` (deep purple-black)
- Primary / brand: `#9BD850` (green) / `#7BC02C` (hover)
- Secondary: `#A668E3` (purple) / `#6E2BAF` (hover)
- Text on dark: `#EDE9F5` (primary) / `#C8BEDD` (soft) / `#857BA0` (muted)
- Error: `#FF6A66`

PWA manifest: `theme_color: '#9BD850'`, `background_color: '#0A0716'`.

---

## 5. Post-review design additions

Three additions Cowork required in review. All three land in the app-shell PR
(step 1) so the foundation is complete on first deploy and subsequent PRs
just consume the infrastructure.

### 5.1 Image-blob storage abstraction (resolves §4.7)

```ts
// lib/storage/index.ts
export interface ImageStorage {
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  get(key: string): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
  delete(key: string): Promise<void>;
}

export function imageStorage(): ImageStorage {
  // Single env-driven switch when the R2 adapter ships:
  //   if (process.env.IMAGE_STORAGE === 'r2') return r2Storage();
  return postgresStorage();
}
```

The Postgres adapter writes/reads `Scan.fileBlob` (a `Bytes` column). The
`key` is the scan ID. The future R2 adapter writes object keys
`tenants/<tenantId>/scans/<scanId>/<filename>`.

### 5.2 Zod validation on `Tenant.settings` (Cowork addition)

`Tenant.settings` is `Json?` in Prisma — flexible at the DB layer but easy
to corrupt at the app layer. Every read/write goes through a validator:

```ts
// lib/tenant/settings.ts
import { z } from 'zod';

export const TenantSettingsSchema = z.object({
  coaMapping: z.record(z.string(), z.string()).optional(),
  defaultExpenseAccount: z.string().optional(),
  defaultCreditAccountInvoice: z.string().default('Accounts Payable'),
  defaultCreditAccountReceipt: z.string().default('Bank'),
}).strict();

export type TenantSettings = z.infer<typeof TenantSettingsSchema>;

export function readTenantSettings(json: unknown): TenantSettings { /* … */ }
export function writeTenantSettings(s: TenantSettings): Prisma.JsonValue { /* … */ }
```

When Jamai provides the AISB COA (§4.2), it populates `coaMapping` via this
schema — type-safe end-to-end.

### 5.3 Per-tenant Gemini rate limit (Cowork addition)

In-memory token bucket per `tenantId`, checked at the entry of every route
that calls Gemini (`POST /api/scan`, `POST /api/scan/[scanId]/comparison`).
One tenant exhausting its bucket returns HTTP 429 with `Retry-After`;
other tenants are unaffected.

```ts
// lib/ratelimit/tenant.ts
export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs?: number;
  remaining?: number;
}

export function checkGeminiRateLimit(tenantId: string): RateLimitDecision { /* … */ }
```

Defaults (overridable via env in `render.yaml`):
- `GEMINI_RATE_LIMIT_PER_MINUTE` (default 60) — sustained rate per tenant
- `GEMINI_RATE_LIMIT_BURST` (default 10) — burst allowance

In-memory state doesn't persist across instance restarts, which is fine
for the free tier's single instance. Move to Redis when we scale to
multi-instance.

### 5.4 Async extraction (Cowork addition; updates §2.6 step 3)

`POST /api/scan` does NOT wait for Gemini. Flow:

```
POST /api/scan
  1. Auth + rate-limit gate
  2. Validate file + read bytes
  3. lib/storage.put(scanId, bytes)
  4. Create Scan { status: PENDING }
  5. Kick off extractInBackground(scanId) — unawaited Promise
  6. return { scanId, status: 'PENDING' }   ← within ~50ms

extractInBackground(scanId):
  - update status: 'SCANNING'
  - call Gemini (long)
  - persist results in $transaction
  - update status: 'DONE' | 'ERROR' | 'DUPLICATE_DETECTED'

GET /api/scan/[scanId]
  - client polls every 1.5–3s until status is terminal
  - returns full serialized Scan when DONE
```

Avoids Render free tier's 30s request limit. Failure mode: if the Node
process restarts mid-extraction, the Scan stays at `SCANNING` forever — a
later PR adds a reaper that marks SCANNING-older-than-N-minutes as ERROR.
Not a blocker for MVP.

---

## 6. PR workflow

- PRs land **strictly sequentially**. PR for step N must merge, deploy on
  Render, and pass smoke tests before PR for step N+1 opens.
- Each PR self-contained: code + tests + any migration + render.yaml
  updates needed.
- When opening a PR, mention it in the PR body so Cowork picks it up for the
  operational side (Render service tweaks, env-var changes, deploy
  verification).
