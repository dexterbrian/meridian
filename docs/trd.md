# Meridian — Technical Requirements Document

| Field | Value |
|---|---|
| Version | 0.2 |
| Date | 28 September 2026 |
| Scope | MVP as defined in [PRD v0.4](./prd.md), and the hackathon build in the [Payaza hackathon PRD v0.1](./payaza-hackathon-prd.md) |
| Principle | Smallest system that meets the PRD. One app, one database, one email provider. Partners: Payaza for the hackathon build; Kotani Pay and Klasha for the full MVP. |

---

## 1. Architecture

```
Browser ──> SolidStart app (SSR + server functions + API routes)
                │
                ├── Supabase Auth      (email OTP / magic link, JWT with role claim)
                ├── Supabase Postgres  (all tables, RLS, pg_trgm for name matching)
                ├── Supabase Storage   (private bucket: kyb-docs, trade-docs)
                ├── Payaza API         (hackathon: collections, KES payouts, name checks, status)
                ├── Kotani Pay API     (Africa collections/payouts, EUR, rates, validation)
                ├── Klasha API         (CNY payouts, global wires, quotes)
                └── Resend API         (transactional email)

Browser ──> Payaza Web Checkout (card, Apple Pay, Google Pay; card data never touches Meridian)

Payaza / Kotani / Klasha ──webhooks──> /api/webhooks/{payaza|kotani|klasha}
Scheduler ──────────────────> /api/jobs/{sanctions-refresh|payout-retry|quote-cleanup}
```

No queue, no cache, no separate backend. Server functions call partners directly. Webhooks write to Postgres. Scheduled jobs are HTTP routes hit by a cron.

### 1.1 Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | SolidStart 2 (2.0.5 at Phase 0) on Vite 8 and Nitro, TypeScript strict, Node 24+ | Owner decision. SSR for landing and pay pages. `"use server"` functions for partner calls. |
| Styling | Tailwind CSS v4 | Already in use. Design tokens in `styles.css` carry over. |
| UI primitives | Kobalte | Headless, accessible, Solid-native. Only import what is used: dialog, select, tabs, toast. |
| Icons | lucide-solid | Same icon set as today. |
| Forms / validation | Zod + native forms | No form library. Zod schemas shared between client and server. |
| Data | Supabase JS v2 | Browser client with anon key for reads under RLS. Server client with service role for writes that must bypass RLS (webhooks, jobs). |
| Auth | Supabase Auth, email OTP | No passwords to manage. Admin role set in `app_metadata.role = 'admin'` by hand in the dashboard. |
| Storage | Supabase Storage, private buckets | Signed URLs, 10-minute expiry, generated server-side only for the owning business or admin. |
| Email | Resend Node SDK | Direct. Templates are plain functions returning HTML strings. Verified sending domain required. |
| Tests | Vitest | Unit tests for pure logic. No e2e in MVP. |
| Lint / format | ESLint + Prettier | Carry over existing config. |
| Hosting | **Cloudflare Workers** via the Nitro `cloudflare_module` preset (`npm run build:workers`). Decided in Phase 0. Railway (Node) stays the fallback; `npm run build` makes a Node server. | Cheapest with built-in cron triggers. Caveat resolved below. |

**Hosting caveat.** Klasha requires request bodies encrypted with AES-256-CBC using OpenSSL's `EVP_BytesToKey` derivation (MD5-based). Workers have WebCrypto for AES-CBC but no MD5. Use a small pure-JS MD5 (e.g. `js-md5`) for key derivation. If this proves awkward in Phase 4, move to Railway.

**Decision (Phase 0 spike, 23 September 2026): Cloudflare Workers.** `src/server/partners/klasha-crypto.ts` does AES-256-CBC with WebCrypto and derives key and IV with `js-md5`. It was run inside the local Workers runtime (workerd via `wrangler dev`): it matched the OpenSSL CLI byte for byte with a fixed salt, decrypted a payload OpenSSL made, and round-tripped with a random salt. The same checks run in Vitest on every push. Klasha encryption is no longer a reason to leave Workers.

### 1.2 Environments

| Env | Partners | Supabase | Domain |
|---|---|---|---|
| local | Payaza sandbox, Kotani sandbox, Klasha dev | Local or a dev project | localhost |
| staging | Payaza sandbox, Kotani sandbox, Klasha dev | Dev project | staging.meridian.* |
| production | Payaza production, Kotani production, Klasha production | Prod project | meridian.* |

`MERIDIAN_MODE=sandbox|live` switches partner base URLs (for Payaza, the `X-TenantID` header) and shows a banner in the UI.

### 1.2.1 Hackathon build

The hackathon build uses a subset of this document.

| Area | Hackathon build | Full MVP |
|---|---|---|
| Partners | Payaza only | Kotani Pay, Klasha |
| Flows | Collection (6.2) and the payout to the business | Collection (6.1) and transfers (6.3) |
| Tables | `businesses` (profile fields only), `payout_accounts`, `payment_requests`, `transactions`, `transaction_events`, `aml_flags`, `partner_calls` | All of section 2 |
| Compliance | Checks in hackathon PRD 5.7. No tiers, no sanctions lists. | Section 5 |
| Checkout | Our pay page, with Payaza Web Checkout for cards | Our pay page and embed script (section 7) |

Nothing built for the hackathon is thrown away. The full MVP adds partners and tables around it.

### 1.3 Environment variables

```
# Supabase
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY          # browser-safe
SUPABASE_SERVICE_ROLE_KEY         # server only

# Partners (server only unless marked)
PAYAZA_API_KEY                    # raw key; sent as "Authorization: Payaza base64(key)"
PAYAZA_MERCHANT_KEY               # browser-safe key for Web Checkout (confirm it differs from PAYAZA_API_KEY)
PAYAZA_WEBHOOK_SECRET             # HMAC SHA512 secret for x-payaza-signature
PAYAZA_BASE_URL                   # https://api.payaza.africa/live/ (same for test; X-TenantID picks the mode)
PAYAZA_TRANSACTION_PIN            # 6-digit PIN required by Transfers
PAYAZA_ACCOUNT_REFERENCE          # from View Payaza Account Details, required by Transfers
KOTANI_API_KEY
KOTANI_WEBHOOK_SECRET
KOTANI_BASE_URL                   # sandbox-api.kotanipay.io | api.kotanipay.io
KLASHA_USERNAME
KLASHA_PASSWORD
KLASHA_PUBLIC_KEY                 # x-auth-token
KLASHA_ENCRYPTION_KEY
KLASHA_BUSINESS_ID
KLASHA_BASE_URL

# Email
RESEND_API_KEY
EMAIL_FROM                        # e.g. Meridian <hello@meridian.appify.co.ke>
ADMIN_EMAIL                       # alerts and lead notifications

# App
APP_URL
MERIDIAN_MODE                     # sandbox | live
JOBS_SECRET                       # bearer for /api/jobs/*
```

---

## 2. Data model

All tables in `public`. All have `id uuid default gen_random_uuid()`, `created_at timestamptz default now()`. Money is `numeric(18,2)`. Currency codes are `text` (ISO 4217). Statuses are `text` with a `check` constraint, not enums, so they can change without migrations.

### 2.1 Kept from today

| Table | Change |
|---|---|
| `waitlist_signups` | Unchanged. |
| `contact_messages` | Unchanged. |
| `demo_transactions` | Kept for demo pages. |
| `payment_requests` | **Replaced** by the new `payment_requests` below. Demo pages switch to `demo_transactions` only. |

### 2.2 New tables

**`businesses`**
| Column | Type | Notes |
|---|---|---|
| owner_user_id | uuid | FK `auth.users`. One owner per business in MVP. |
| name | text | Legal name |
| trading_name | text null | |
| country | text | ISO-2 |
| registration_number | text | Unique per country |
| tax_number | text null | KRA PIN, TIN |
| address | text null | |
| website | text null | |
| tier | smallint | 0..3. Default 0. |
| kyb_status | text | `draft`, `submitted`, `auto_passed`, `auto_failed`, `verified`, `rejected`, `frozen` |
| risk_level | text | `low`, `medium`, `high`. Default `low`. |
| tier3_per_tx_limit_usd | numeric null | Only for tier 3 |
| tier3_monthly_limit_usd | numeric null | |
| reviewed_by | uuid null | Admin user |
| reviewed_at | timestamptz null | |
| review_note | text null | |

Unique: `(country, registration_number)`.

**`business_people`** — directors and 25%+ owners
| Column | Type | Notes |
|---|---|---|
| business_id | uuid | FK |
| full_name | text | |
| role | text | `director`, `owner`, `both` |
| nationality | text | ISO-2 |
| id_type | text | `national_id`, `passport` |
| id_number | text | |
| ownership_pct | numeric null | |
| screened_at | timestamptz null | |
| screening_result | jsonb null | Matches, scores |

Index: `id_number` for duplicate check.

**`kyb_documents`**
| Column | Type | Notes |
|---|---|---|
| business_id | uuid | FK |
| doc_type | text | `incorporation`, `tax_cert`, `address_proof`, `director_id`, `ownership_decl`, `source_of_funds`, `bank_statement`, `other` |
| person_id | uuid null | FK `business_people`, for director IDs |
| storage_path | text | `kyb-docs/{business_id}/{uuid}.{ext}` |
| mime_type | text | |
| size_bytes | int | |
| status | text | `uploaded`, `accepted`, `rejected` |
| note | text null | |

**`kyb_checks`** — automated check log
| Column | Type | Notes |
|---|---|---|
| business_id | uuid | FK |
| check_type | text | `reg_format`, `sanctions`, `duplicate_identity`, `geography`, `documents`, `email_domain` |
| passed | boolean | |
| details | jsonb | Evidence |
| ran_at | timestamptz | |

**`payout_accounts`** — where a business gets paid
| Column | Type | Notes |
|---|---|---|
| business_id | uuid | FK |
| currency | text | |
| country | text | |
| method | text | `bank`, `momo` |
| details | jsonb | `{bank_code, account_number, account_name}` or `{phone, network}` |
| partner | text | `payaza`, `kotani`, `klasha` |
| partner_customer_key | text null | Kotani customer record |
| validated | boolean | Via partner validation endpoint (Payaza: account name enquiry) |
| is_default | boolean | One default per currency. A business may hold accounts in several currencies (KES, UGX …). Payouts go to the account matching the request currency if there is one, else to the business's main default account, converted. |

**`recipients`** — suppliers a business pays
| Column | Type | Notes |
|---|---|---|
| business_id | uuid | FK |
| name | text | |
| country | text | |
| currency | text | |
| method | text | `bank`, `momo`, `alipay`, `unionpay`, `wire` |
| details | jsonb | Method-specific. Klasha fields for CNY/wire. |
| partner | text | Chosen by routing (section 4) |
| partner_beneficiary_id | text null | Klasha beneficiary token |
| screened_at | timestamptz null | |
| screening_result | jsonb null | |
| first_paid_at | timestamptz null | For R7 |

**`payment_requests`** — links and checkout
| Column | Type | Notes |
|---|---|---|
| business_id | uuid | FK |
| reference | text | Unique. `MRD-XXXXXXXX` |
| invoice_number | text null | The business's own invoice number, as typed. Not unique: one invoice can be paid in parts. |
| idempotency_key | text null | From the create form. Unique per business. |
| amount | numeric null | Null = payer enters amount. The exact amount the business receives. |
| min_amount / max_amount | numeric null | For open amount |
| currency | text | |
| memo | text null | |
| payer_email | text null | Optional pre-fill / notify |
| usage | text | `single`, `multi` |
| status | text | `active`, `paid`, `expired`, `disabled` |
| expires_at | timestamptz null | |
| paid_count | int | |
| attempt_count | int | Default 0. Numbers each payment attempt. |

Unique: `(business_id, idempotency_key)`. Index: `(business_id, invoice_number)` for search.

**`transactions`**
| Column | Type | Notes |
|---|---|---|
| business_id | uuid | FK |
| kind | text | `collection`, `transfer` |
| status | text | `quoted`, `held`, `blocked`, `awaiting_payin`, `collected`, `paying_out`, `settled`, `failed`, `refunded` |
| reference | text | Unique. Our reference, sent to partners. Collections: one per attempt, `MRD-XXXXXXXX-N` (see 2.5). |
| payment_request_id | uuid null | For collections |
| attempt_no | int null | For collections. Unique with `payment_request_id`. |
| idempotency_key | text null | For transfers, from the create form. Unique per business. |
| recipient_id | uuid null | For transfers |
| payout_account_id | uuid null | For collections |
| send_currency | text | |
| send_amount | numeric | The amount before fees. For a collection, the request amount. |
| receive_currency | text | |
| receive_amount | numeric | What the recipient/business gets. Equals `send_amount` converted, because the payer covers fees. |
| partner_fee_in | numeric | Collection leg fee |
| partner_fee_out | numeric | Payout leg fee |
| meridian_fee | numeric | 1% of `total_charged` |
| total_charged | numeric | What the payer is charged. Grossed up so that total_charged − all fees = send_amount (2.5). |
| usd_equivalent | numeric | For limits and AML. Computed at quote time. |
| partner_in | text null | `payaza`, `kotani`, `klasha` |
| partner_in_ref | text null | |
| partner_out | text null | |
| payout_reference | text null | Unique. Our payout reference, set once, **before** the payout call (2.5). |
| partner_out_ref | text null | |
| quote | jsonb | Raw partner quote |
| quote_expires_at | timestamptz null | |
| payer_name / payer_email / payer_country | text null | For collections |
| pay_method | text | `momo`, `bank`, `card` |
| settled_at | timestamptz null | |
| failure_reason | text null | |

Indexes: `(business_id, created_at)`, `reference`, `status`. Unique: `(payment_request_id, attempt_no)`, `(business_id, idempotency_key)`, `payout_reference`.

**`transaction_events`** — audit trail
| Column | Type | Notes |
|---|---|---|
| transaction_id | uuid | FK |
| source | text | `system`, `payaza_webhook`, `kotani_webhook`, `klasha_webhook`, `admin`, `job` |
| from_status / to_status | text | |
| payload | jsonb | Full webhook body or admin note |
| idempotency_key | text | Unique. Partner event id or hash. |

**`aml_flags`**
| Column | Type | Notes |
|---|---|---|
| business_id | uuid | FK |
| transaction_id | uuid null | |
| rule | text | `R1`..`R10` |
| severity | text | `low`, `medium`, `high` |
| action_taken | text | `none`, `hold`, `block`, `freeze` |
| evidence | jsonb | Matched names, amounts, counts |
| status | text | `open`, `cleared`, `escalated` |
| resolved_by | uuid null | |
| resolved_at | timestamptz null | |
| note | text null | |

**`sanctions_entries`**
| Column | Type | Notes |
|---|---|---|
| source | text | `ofac_sdn`, `un`, `eu`, `uk` |
| source_id | text | |
| name | text | Primary name |
| aliases | text[] | |
| entity_type | text | `individual`, `entity`, `vessel`, `other` |
| countries | text[] | |
| raw | jsonb | |
| list_version | text | Date of download |

Index: `gin (name gin_trgm_ops)`, `gin (aliases)`.

**`partner_calls`** — every outbound request
| Column | Type | Notes |
|---|---|---|
| partner | text | |
| endpoint | text | |
| request | jsonb | Secrets stripped |
| response | jsonb | |
| status_code | int | |
| duration_ms | int | |
| transaction_id | uuid null | |

Retention: 7 years. Nothing in this schema is ever hard-deleted. Rows get `status` changes only.

**`start_collection_attempt`** — Postgres function, called by the pay page's server function

1. Lock the `payment_requests` row (`select … for update`).
2. Refuse if it is not `active`, or if it is single use and already paid.
3. Add 1 to `attempt_count` and insert a `transactions` row in `awaiting_payin` with the attempt reference.
4. Return the attempt reference. Only then does the server call Payaza.

Doing this in one database transaction means two clicks can't both start a charge under the same number, and a paid single-use request can't be charged again.

### 2.3 RLS summary

| Table | Business owner | Admin | Anon |
|---|---|---|---|
| businesses, business_people, kyb_documents, payout_accounts, recipients | Read and write own (`owner_user_id = auth.uid()`) | All | None |
| kyb_checks, aml_flags, transaction_events, partner_calls | Read own | All | None |
| payment_requests | Read and write own | All | **Read one row by reference** via a server function, never a direct table policy |
| transactions | Read own | All | None. Pay page reads via server function. |
| sanctions_entries | None | Read | None |
| waitlist_signups, contact_messages | None | Read | Insert via server function with rate limit |

Admin is `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`.

All writes that change money state happen in server functions with the service-role client, after the function has checked ownership itself. The anon key never updates `transactions` or `payment_requests`.

### 2.4 Storage

| Bucket | Path | Access |
|---|---|---|
| `kyb-docs` | `{business_id}/{uuid}.{ext}` | Private. Upload via signed upload URL from server. Read via 10-minute signed URL, owner or admin only. |
| `trade-docs` | `{business_id}/{transaction_id}/{uuid}.{ext}` | Same. Forwarded to Klasha file upload for CNY B2B. |

Limits: PDF, JPG, PNG. 10 MB per file.

### 2.5 References and fees on top

| Reference | Format | Example | Rules |
|---|---|---|---|
| Invoice number | Free text from the business, trimmed, max 64 characters | `INV-2048` | Optional. Not unique. Shown and searchable. |
| Request | `MRD-` + 8 characters, no ambiguous letters | `MRD-VNN6FG3X` | Unique. One per payment request. |
| Payment attempt | Request + `-` + attempt number in base 36 | `MRD-VNN6FG3X-1`, `MRD-VNN6FG3X-A` | Unique. Sent to Payaza as `transaction_reference`. Two base-36 characters keep it within Payaza's 15-character card limit for up to 1,295 attempts. A multi-use link that reaches that needs a new link. |
| Payout | `MRDP-` + the attempt reference without its `MRD-` | `MRDP-VNN6FG3X-1` | Unique. One per collected attempt. Meets Transfers' 10-character minimum. |

The hackathon PRD's example `MRDP-VNN6FG3X` becomes `MRDP-VNN6FG3X-1`, so a multi-use link's many payouts stay unique.

**Fees on top.** The payer covers every fee. `src/lib/fees.ts` grosses the amount up: `total_charged = round2(send_amount / (1 − partner rate − 0.01))`. Meridian's fee is 1% of `total_charged`. The partner fee takes the rounding remainder, so `total_charged − fees = send_amount` to the cent. Until the payer picks a method, the quote has zero fees and `total_charged = send_amount`.

---

## 3. Application structure

```
src/
  routes/
    index.tsx                      landing
    terms.tsx  privacy.tsx
    demo/                          three demos, unchanged behaviour
    pay/[reference].tsx            hosted pay page (public)
    embed.js.ts                    serves the embed script
    auth/
      sign-in.tsx  callback.tsx
    app/                           business area, requires session
      index.tsx                    dashboard: tier, usage, recent transactions
      onboarding/                  profile, people, documents, submit
      collect/                     list + new payment request
      send/                        recipients, new transfer, status
      transactions/[id].tsx
      settings/payout-accounts.tsx
    admin/                         requires admin role
      kyb.tsx                      queue
      kyb/[businessId].tsx
      flags.tsx
      transactions.tsx
    api/
      webhooks/payaza.ts
      webhooks/kotani.ts
      webhooks/klasha.ts
      jobs/sanctions-refresh.ts
      jobs/payout-retry.ts
      jobs/quote-cleanup.ts
  server/                          "use server" only
    supabase.ts                    admin client
    partners/
      payaza.ts                    thin typed client: auth headers, collections, transfers, status, name check
      kotani.ts                    thin typed client
      klasha.ts                    thin typed client + encryption
      routing.ts                   pick partner for a leg
    compliance/
      screening.ts                 name matching
      rules.ts                     R1..R10
      limits.ts                    tier limits and usage
      lists.ts                     FATF constants
    money/
      quote.ts                     build a Quote from partner response
      collect.ts                   create request, handle paid, payout
      transfer.ts                  create, payin, payout
    email/
      send.ts  templates.ts
    kyb/
      checks.ts                    automated checks
  lib/                             pure, testable, shared
    fees.ts                        Meridian 1%, gross-up, fee schedule per partner and method
    money.ts                       formatting
    reference.ts                   request, attempt and payout references
    schemas.ts                     Zod
  components/
    ui/                            Kobalte wrappers, only what is used
    site/                          header, footer, banner
    fee-breakdown.tsx              fee summary, breakdown, "why you see the fees"
    pay-methods.tsx                method picker; card entry hands off to Payaza Web Checkout
```

Rule: anything in `src/lib` has no I/O and has tests. Anything in `src/server` is I/O and is thin.

---

## 4. Partner integration

### 4.1 Routing

`routing.ts` picks the partner for each leg from a static table. No dynamic discovery in MVP.

**Hackathon build.** One table, all Payaza:

| Leg | Currency / country | Payaza product |
|---|---|---|
| Collect | KES, UGX, TZS, GHS, SLE, LRD, ZMW, XAF, CDF | Mobile money collection (`X-ProductID: app`) |
| Collect | XOF (CI, BJ) | XOF collection, with the Orange Money OTP step |
| Collect | ZAR | ZAR EFT collection |
| Collect | NGN | Dynamic virtual account; card |
| Collect | USD (any country) | Card, Apple Pay, Google Pay via Web Checkout |
| Payout | The business's payout currency (KES, UGX, TZS, NGN, GHS, ZAR, ZMW, XAF, LRD, CDF), mobile money or bank | Transfers, after account name enquiry |

**Full MVP:**

| Leg | Currency / country | Partner | Endpoint family |
|---|---|---|---|
| Collect | KES, NGN, GHS, ZAR, UGX, TZS | Kotani | `deposit/mobile-money`, `deposit/bank-checkout`, `deposit/card` |
| Collect | EUR | Kotani | `deposit/card`, `deposit/bank-checkout` (confirm) |
| Payout | KES, GHS, UGX, TZS, NGN momo | Kotani | `withdraw/mobile-money` |
| Payout | KES, ZAR bank | Kotani | `cross-boarder/invoice` (KES bank) / `withdraw/bank` (ZAR) |
| Payout | NGN, GHS, TZS bank | Klasha | Payout API per currency |
| Payout | EUR | Kotani (confirm) else Klasha Wire | |
| Payout | CNY | Klasha | `quotation/v2` → `bank/transfer/v2/request` |
| Payout | USD, JPY, GBP, AED, HKD, INR | Klasha Wire | `merchantbeneficiary/create` → `wire/generate/quote` → `wire/initiate` |

### 4.2 Payaza (hackathon build)

- **Auth.** `Authorization: Payaza {base64(PAYAZA_API_KEY)}`. `X-TenantID: test | live` from `MERIDIAN_MODE`. `X-ProductID: app` on mobile money, XOF and ZAR calls. One base URL for both modes.
- **Collections.**
  - Mobile money, XOF, ZAR: server calls Process Collection with the attempt reference, amount = `total_charged`, currency, payer phone, country and network code. The payer approves on their phone. XOF adds an OTP step on our page.
  - NGN bank transfer: server creates a dynamic virtual account (30 minutes) and our page shows the account number, like the demo.
  - Card, Apple Pay, Google Pay: our page opens Payaza Web Checkout (`PayazaCheckout.setup`) with `PAYAZA_MERCHANT_KEY`, the attempt reference and `total_charged`. **Card numbers are typed into Payaza's form, never ours.** The card fields in today's demo are a simulation only.
  - The Web Checkout's client callback is only a hint. It can be faked. The server confirms by webhook or status query before anything moves.
- **Payment links.** Payaza's own payment links (with the customer bearing fees) are a fallback for payers who want Payaza's page. Our `/pay/{reference}` stays the main page because it shows Meridian's fees, invoice number and reference.
- **Webhooks.** `POST /api/webhooks/payaza`. Verify `x-payaza-signature` = HMAC SHA512 of the raw body with `PAYAZA_WEBHOOK_SECRET`, timing-safe compare. Reject unknown references. Then confirm with the matching status query before changing state, as Payaza advises.
- **Status queries.** Card and checkout by merchant reference; mobile money; virtual accounts; transfers. Used after every webhook, by the payout retry job, and when a webhook is late.
- **Payout.** Account name enquiry when the business saves its Kenyan account. On a confirmed collection, call Transfers in the payout account's currency (mobile money or bank) with `payout_reference`, `PAYAZA_TRANSACTION_PIN` and `PAYAZA_ACCOUNT_REFERENCE`, for exactly `send_amount`.
- **Where the money sits.** Meridian is the Payaza merchant. A payment lands in Meridian's Payaza balance and leaves in the payout, usually within minutes. Meridian's 1% is what stays behind. No Meridian ledger or stored balance for the business, the same model as the Kotani wallet.
- **Split settlement.** Payaza's split sends a set share of each charge to a beneficiary **bank account** on Payaza's settlement schedule. The owner keeps `split_value` (percent or flat) of the gross; the beneficiary gets the rest. Its docs only show NGN, and don't say who bears Payaza's fee. So it can't carry M-Pesa payouts or the same-day promise today. **Proposed:** Transfers is the payout path. Split settlement pays a business's bank account directly only where Payaza confirms KES support and fees. This changes hackathon PRD H-28 from Must to "Must once Payaza confirms". Owner to decide.
- **Fees.** No fee quote endpoint is documented. `fees.ts` holds Payaza's rate per method and currency, set from Payaza's pricing. After each webhook, compare Payaza's reported fee with ours; a gap over 1 cent is flagged for review.

### 4.3 Kotani Pay

- Auth: `Authorization: Bearer {KOTANI_API_KEY}`.
- Customer records: create one Kotani customer per payer phone / per payout account, store `customer_key`.
- Quote: `POST /api/v3/rate/fiat` `{from, to, amount}` returns `value`, `depositFee`, `withdrawalFee`, `withdrawalTransactionAmount`. Map straight into `transactions.partner_fee_in`, `partner_fee_out`, `receive_amount`. Do not recompute; the doc warns rounding will drift.
- Fee arrangement: Kotani sets per wallet who pays the fee. Read `transaction_amount` and `transaction_cost` from webhooks, never assume.
- Validation: `customers/validate-mobile-money`, `customers/validate-bank` before saving a payout account or recipient.
- Webhooks: configure a secret in their dashboard. Verify `X-Kotani-Signature` = `sha256=HMAC(secret, JSON.stringify({event, data}))` with timing-safe compare. Events used: `transaction.deposit.status.updated`, `transaction.withdrawal.status.updated`, `kyc.status.changed`. Deposit payloads are snake_case, withdrawal payloads camelCase. Return 200 fast, process inline (small volume) but idempotently.
- Reference: always send our `transactions.reference` as `reference_id` so webhooks map back.

### 4.4 Klasha

- Auth: `POST /auth/account/v2/login` → bearer token (cache 50 minutes). Header `x-auth-token: {KLASHA_PUBLIC_KEY}`.
- Encryption: every request body is `{ "message": encrypt(JSON) }`. AES-256-CBC, OpenSSL `Salted__` format, key/IV from `EVP_BytesToKey(MD5, 1 iteration)`. Implement once in `klasha.ts`, test against their Postman example.
- CNY: `POST /wallet/merchant/quotation/v2` → `{fxRate, fee, sourceAmount, expiration, id}`. Show `sourceAmount + fee` as total, `destinationAmount` as recipient gets. B2B bank requires `document` with attachments uploaded via `POST /wallet/merchant/file`. Store Klasha `fileId` on `kyb_documents`/trade docs.
- Wire: create beneficiary once per recipient, store token. Quote → initiate. Quote expires when their rate changes, so quote immediately before pay-in confirmation and re-quote if `QuoteNotFoundException`.
- Webhooks: `{event: "payout", data: {reference, status}}`. No signature documented. Mitigate: treat webhook as a hint, then call their status endpoint to confirm before changing state.
- Source of funds: Klasha payouts debit Klasha wallet balances. Meridian must pre-fund the Klasha USD wallet (via Kotani → Klasha swap or bank). **Operational task, not code.** Phase 4 exit criterion.

### 4.5 Quote object (internal)

```ts
type Quote = {
  sendCurrency: string; sendAmount: number;
  receiveCurrency: string; receiveAmount: number;   // from partner
  partnerFeeIn: number; partnerFeeOut: number;      // from partner
  meridianFee: number;                              // totalCharged * 0.01
  totalCharged: number;                             // grossed up: totalCharged - all fees = sendAmount
  usdEquivalent: number;                            // for limits
  partnerIn: 'payaza' | 'kotani' | 'klasha' | null;
  partnerOut: 'payaza' | 'kotani' | 'klasha' | null;
  expiresAt: string | null;
  raw: unknown;
};
```

`fees.ts` owns the gross-up (2.5). Where a partner quotes its own fee and rate (Kotani, Klasha), those numbers are used as given and not recomputed. Where it doesn't (Payaza), the fee schedule in `fees.ts` is used and checked against the webhook.

---

## 5. Compliance engine

### 5.1 Limits (`limits.ts`)

```ts
const TIERS = {
  0: { perTx: 0,      monthly: 0,      count: 0 },
  1: { perTx: 500,    monthly: 2000,   count: 10 },
  2: { perTx: 10000,  monthly: 50000,  count: Infinity },
  3: { perTx: null,   monthly: null,   count: Infinity },  // from businesses row
};
```

Usage = sum of `usd_equivalent` and count of `transactions` for the business where `status not in ('blocked','failed','quoted')` and `created_at > now() - 30 days`. One query. Checked inside the same server function that creates the transaction, before any partner call.

USD equivalent: from the partner quote when it includes USD, else from Kotani `rate/public` for `{currency}→USD` fetched at quote time. Stored on the transaction so history does not drift.

### 5.2 Screening (`screening.ts`)

- Normalise: lowercase, strip punctuation and honorifics, collapse whitespace.
- Query `sanctions_entries` with `similarity(name, $1) > 0.6 or $1 % any(aliases)`.
- Score ≥ 0.85 → match. 0.6 to 0.85 → possible, flag low, proceed. Tune with real data.
- Store result JSON on the screened row.

### 5.3 Rules (`rules.ts`)

Pure functions. Input: the candidate transaction plus a context object the caller loads (business, recent transactions, recipient, screening results). Output: list of `{rule, severity, action, evidence}`. Caller applies the strongest action: `block` > `hold` > `none`. Table in PRD 5.5.

Run points:
- KYB submit: R1, R6, R9.
- Recipient save: R1, R6.
- Transaction create: R1 (payer), R2, R3, R4, R5, R6, R7, R8.
- Nightly job: R10 over all businesses, people, recipients.

### 5.4 Sanctions refresh job

Nightly. Download OFAC SDN (CSV), UN consolidated (XML), EU (XML), UK HMT (CSV). Parse to `sanctions_entries` with `list_version = today`. Swap by deleting rows with older `list_version` after successful insert. Then run R10. Alert admin on any parse failure.

---

## 6. Money flows (sequence)

### 6.1 Collection via link

1. Payer opens `/pay/{ref}`. Server function loads request (not the table directly). Shows amount, methods, fee preview using Kotani quote for the collect leg.
2. Payer submits method + phone/email. Server function: create `transactions` row `awaiting_payin`, run rules, call Kotani deposit with `reference_id = reference`, `callbackUrl = APP_URL/api/webhooks/kotani`. For bank checkout / card, redirect payer to `checkoutUrl`.
3. Kotani webhook `SUCCESSFUL` → verify, idempotency check on `transaction_events`, update to `collected`, record `transaction_amount`, `transaction_cost`.
4. Same handler: if not `held`, set `payout_reference` (only if empty), then call Kotani withdrawal to the business's default payout account for `receive_amount`, the full request amount. Status `paying_out`.
5. Withdrawal webhook `SUCCESSFUL` → `settled`. Email receipts with the invoice number and Meridian reference. `payment_requests.paid_count++`, status `paid` if single use.
6. Any `FAILED` → `failed`, flag admin, email business.

### 6.2 Collection via Payaza (hackathon build)

1. Payer opens `/pay/{ref}`. A server function loads the request: amount, currency, invoice number, reference, memo. Fees show 0.
2. Payer picks a method. The page shows the Payaza fee and Meridian's 1%, grossed up (2.5).
3. Payer confirms. Server function runs `start_collection_attempt` → attempt reference. Checks from hackathon PRD 5.7 run. Then:
   - mobile money / XOF / ZAR: Process Collection. Page waits for the result.
   - NGN transfer: create a dynamic virtual account. Page shows it with a countdown.
   - card / wallets: page opens Payaza Web Checkout with the attempt reference.
4. Payaza webhook → verify signature → insert into `transaction_events` (repeat = stop) → status query → `collected`. Record Payaza's fee and compare with ours.
5. If not `held`: set `payout_reference` if empty, then Transfers pays the business's default payout account. Same currency as the request: `send_amount`. Different currency: `send_amount` converted (open question 7). Status `paying_out`.
6. Transfer confirmed (webhook + status query) → `settled`. Receipts to both sides. `paid_count++`; single use → `paid`.
7. A second attempt that succeeds on an already-paid single-use request is marked `collected`, not paid out, and flagged high for a refund.
8. Any failure → `failed`, flag admin, email business.

### 6.3 Transfer

1. Business picks recipient, enters amount. Server function gets quote (Kotani fiat or Klasha), builds `Quote`, runs rules, creates `transactions` row `quoted` (or `held`/`blocked`).
2. Business confirms before `quote_expires_at`. Server function: status `awaiting_payin`, Kotani deposit STK to the business's phone or bank checkout redirect.
3. Deposit webhook `SUCCESSFUL` → `collected`. If `held`, stop and wait for admin.
4. Payout: Kotani withdrawal, or Klasha quotation → transfer, or Klasha wire quote → initiate. Status `paying_out`. If Klasha quote expired, re-quote; if new `receiveAmount` is lower by more than 1%, hold and email business to re-confirm.
5. Payout success → `settled`. Emails.
6. Payout failure → `failed`, flag high, admin refunds via partner dashboard, marks `refunded`.

### 6.4 Idempotency

Nobody is charged twice. Nobody is paid twice. Rules from PRD 7.1 and hackathon PRD 5.5, in code:

| Step | Mechanism |
|---|---|
| Create request / create transfer | The form sends a random `idempotency_key`. Insert with `on conflict (business_id, idempotency_key) do nothing`, then return the existing row. |
| Start a payment attempt | `start_collection_attempt` locks the request row (2.2). The attempt reference is saved before the partner call. A retry of the same attempt reuses it. |
| Webhook | `idempotency_key = partner + ':' + (event id, or reference + ':' + status)`. Insert into `transaction_events` first. Unique violation → return 200, do nothing. |
| State change | Every status update is conditional: `update … where id = $1 and status = $expected`. Zero rows updated = someone else already did it; stop. |
| Payout | `update transactions set payout_reference = $ref where id = $1 and payout_reference is null`. Only the caller that set it makes the payout call. |
| Payout retry | Query the partner's status with `payout_reference` first. Retry with the same reference only if the partner has no record. |
| Pay button | Disabled while a request is in flight. A convenience only; the server rules above are what count. |

---

## 7. Embed script

Not part of the hackathon build; Payaza Web Checkout covers card entry there.

`GET /embed.js` returns ~60 lines of vanilla JS, cached 1 hour.

```html
<script src="https://meridian.example/embed.js"
        data-ref="MRD-7K3PQ2XA"
        data-label="Pay with Meridian"></script>
```

Behaviour: render a button where the script tag sits. On click, open `APP_URL/pay/{ref}?embed=1` in a full-screen iframe modal. Pay page in embed mode posts `{type:'meridian:paid', reference, amount, currency}` to `window.parent` on settle, and `{type:'meridian:closed'}` on close. If iframe fails to load in 3s, open in new tab. Merchant listens with `window.addEventListener('message', ...)`.

Pay page sets `Content-Security-Policy: frame-ancestors *` only when `?embed=1` and the request has a valid reference.

---

## 8. Email

| Trigger | To | Template |
|---|---|---|
| Waitlist / contact submit | Submitter + `ADMIN_EMAIL` | Confirmation / lead alert |
| OTP | User | Supabase handles |
| KYB submitted | Admin | Review needed |
| KYB decision | Business | Approved (tier, limits) or rejected (note) |
| Payment request created with payer email | Payer | Link |
| Collection settled | Payer + business | Receipt, with invoice number and Meridian reference |
| Transfer settled | Business (+ recipient if email) | Confirmation |
| Transaction held / failed | Business + admin | Status |
| AML flag high | Admin | Alert |
| Job failure | Admin | Alert |

All send through one `sendEmail({to, subject, html})` in `server/email/send.ts`. Failures are logged to `partner_calls` with `partner='resend'` and alerted. Never swallowed.

---

## 9. Security

- Service role key only in server code. Verified by a lint rule banning its import outside `src/server`.
- All `/app/*` routes check session in a route-level `preload`/middleware. All `/admin/*` check role claim.
- Server functions re-check ownership with a query, never trust client-sent `business_id`.
- Webhook routes: verify signature (Payaza HMAC SHA512, Kotani HMAC SHA256) or confirm via status API (Klasha). Payaza webhooks are also confirmed by status query. Reject unknown references.
- Card data never touches Meridian. Card entry happens inside Payaza Web Checkout. Only `PAYAZA_MERCHANT_KEY` reaches the browser.
- `PAYAZA_TRANSACTION_PIN` authorises payouts. Server only, never logged.
- `/api/jobs/*`: `Authorization: Bearer {JOBS_SECRET}`.
- Rate limit public inserts (waitlist, contact, pay page submit) by IP: 10 per 10 minutes, in-memory per isolate is enough for MVP.
- Signed storage URLs, 10 minutes.
- No PII in logs. `partner_calls.request` strips keys named `*key*`, `*secret*`, `*token*`, `*pin*`, `account_number`, `id_number`.
- Dependencies pinned. `npm audit` in CI.

---

## 10. Testing

Vitest, `src/lib/**` and `src/server/compliance/**` and `src/server/partners/klasha.ts` (encryption).

Must-have tests:
- `meridianFee` rounding.
- Gross-up: `total_charged − fees = send_amount` to the cent for many amounts and every method; zero fees before a method is picked.
- Reference generator: request, attempt (base 36, ≤ 15 characters) and payout formats.
- Payaza signature verify: valid, tampered, wrong secret.
- Webhook idempotency: the same event twice changes state once.
- Payout guard: two concurrent payout calls for one transaction make one partner call.
- `limits`: each tier boundary, rolling window edge.
- `rules`: one test per rule, positive and negative.
- `screening`: exact, alias, near-miss, non-match.
- Kotani signature verify: valid, tampered, wrong secret.
- Klasha encrypt: matches a known ciphertext from their Postman collection (decrypt round-trip).
- Quote builder: Kotani fiat response → `Quote`; Klasha CNY response → `Quote`.
- Reference generator: no ambiguous chars.

Manual test plan per phase in [phases.md](./phases.md).

---

## 11. Operations

| Task | How | Frequency |
|---|---|---|
| Sanctions refresh | `/api/jobs/sanctions-refresh` via cron | Nightly 02:00 EAT |
| Payout retry | `/api/jobs/payout-retry`: transactions `collected` or `paying_out` for > 10 min. Status query first, then retry with the same `payout_reference` only if the partner has no record. | Every 10 min |
| Quote cleanup | Expire `quoted` transactions past `quote_expires_at` | Hourly |
| FATF list update | Edit `lists.ts`, deploy | Quarterly, after FATF plenary |
| Klasha wallet funding | Manual, Klasha dashboard | As balance dips |
| Kotani settlement to Appify bank | Kotani dashboard / schedule | Weekly |
| Payaza balance check | Payaza dashboard: Meridian's 1% builds up; each payout currency's float covers payouts | Daily during the pilot |
| Backups | Supabase PITR (Pro plan) | Continuous |
| Record retention | Never delete. Storage bucket lifecycle disabled. | 7 years |

---

## 12. Migration from current code

1. New SolidStart project in the same repo root. Delete TanStack files once parity is reached.
2. Keep `supabase/migrations/…` first file. Add new migrations for section 2 tables.
3. Port `styles.css` tokens, `fee-breakdown`, site chrome, landing copy, legal pages, three demos.
4. Replace `notify.functions.ts` with `server/email`.
5. Drop Lovable files (`.lovable/`, `AGENTS.md` Lovable block, `@lovable.dev/*` dependency, Lovable error reporting).
6. Disconnect Lovable from the GitHub repo after first SolidStart deploy.

---

## 13. Open technical questions

1. Does Kotani's `rate/fiat` cover EUR legs, and does `deposit/card` accept EUR? If not, Klasha Wire for EUR payout and no EUR collection in MVP.
2. Kotani bank payout for KES: is `cross-boarder/invoice` the right endpoint, or is a KES `withdraw/bank` available on request?
3. Kotani fee arrangement per wallet (customer pays vs Meridian pays). Affects whether `total_charged` includes the deposit fee or the partner nets it.
4. Klasha webhook authenticity: any signature header not in the docs? Otherwise status-API confirmation stands.
5. ~~Cloudflare Workers vs Node host.~~ Settled in Phase 0: Workers. See 1.1.
6. Supabase plan: Free has no PITR and pauses after inactivity. Pro (USD 25/month) before any live money.

**Payaza (hackathon build)**

7. **Currency conversion.** A payment collected in GHS, XOF, NGN or USD lands in that currency's balance. Can Payaza convert it and pay out in the business's currency (KES, UGX, TZS …)? If not, each payout currency needs a float that Meridian tops up, and the demo can only show same-currency payouts. Biggest risk to the demo.
8. Does Payaza issue a separate browser-safe key for Web Checkout, or is it the same key used on the server?
9. Split settlement: KES support, who bears Payaza's fee, and settlement timing (see 4.2).
10. Is Payaza's fee returned before a charge, or only after? Current plan uses a fee schedule and reconciles.
11. Can a Payaza merchant collect on behalf of other businesses (Meridian's model), and under what terms? Sub-accounts are documented as internal only.
12. Webhook retry policy, and what Payaza does when a transaction reference is reused.
13. Is the 15-character card reference limit hard or a recommendation?
14. Transfers to M-Pesa: exact bank code and field names for Kenyan mobile money and `kepss` bank payouts.
