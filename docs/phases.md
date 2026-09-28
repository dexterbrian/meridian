# Meridian MVP — Phases

| Field | Value |
|---|---|
| Version | 0.2 |
| Date | 28 September 2026 |
| Source | [PRD v0.4](./prd.md) · [TRD v0.3](./trd.md) · [Payaza hackathon PRD v0.2](./payaza-hackathon-prd.md) |

Six phases. Each has a goal, tasks, and an exit test. Nothing in a later phase starts until the exit test passes. Estimates assume one developer working with AI assistance. Every phase ends in a commit series and a push.

Compliance (Phase 2) comes before any real money (Phases 3 and 4) on purpose.

**Phase H (28 September 2026) sits between Phase 0 and Phase 1.** It is the Payaza hackathon build: collections only, on Payaza, with light checks. It borrows tables from Phases 1 to 3 and builds the collection flow early. Nothing in it is thrown away; Phases 1 to 3 add around it.

---

## Phase H — Payaza hackathon build

**Goal.** A business signs in, adds a payout account, creates a payment request with its own invoice number, and is paid by a customer through Payaza. Idempotent at every money step. Deployed to Vercel at `meridian.appify.co.ke`.

**Done in one day.** Exit tested against Payaza's sandbox with `npm run e2e:sandbox`.

### Tasks

**H.1 Schema**
- [x] Migration: `businesses` (profile fields), `payout_accounts`, new `payment_requests`, `transactions`, `transaction_events`, `aml_flags`, `partner_calls.transaction_id`. RLS. `start_collection_attempt` and `mark_request_paid` functions.
- [x] Regenerate `database.types.ts`.

**H.2 Pure rules (`src/lib`)**
- [x] Attempt and payout references. Whole-unit gross-up per currency. Payaza network codes and rails. Webhook signature and parsing. Hackathon checks. CSV. Status labels. Zod schemas. Tests: 75 passing.

**H.3 Payaza client and state machine (`src/server`)**
- [x] `partners/payaza.ts`: collections (momo, XOF OTP, ZAR), virtual accounts, status queries, name enquiry, main accounts, Transfers, transfer status, sandbox funding helpers. Every call logged.
- [x] `money/collect.ts`: start attempt, collected, checks, hold, payout claim, settle, fail, reconcile, retry sweep, admin actions, sandbox approval.
- [x] `/api/webhooks/payaza` with base64 HMAC SHA512 verification. `/api/jobs/payout-retry` with bearer.
- [x] Email templates: payer and business receipts, request link, held, failed, flag alert.

**H.4 Business area, pay page, admin**
- [x] `/app`: dashboard with search and CSV. `/app/onboarding`. `/app/settings/payout-accounts` with name enquiry. `/app/collect/new` with copy, WhatsApp, email. `/app/collect/[reference]` with per-attempt timeline.
- [x] `/pay/[reference]`: real flow (momo wait and OTP, NGN virtual account, Payaza Web Checkout), demo fallback, attempt resume, sandbox approve button.
- [x] `/admin`: flags, transactions, release, reject, retry payout, mark refunded, payout sweep. `/admin/transactions/[id]`.

**H.5 Hosting and CI**
- [x] Vercel build (`npm run build:vercel`), `vercel.json` cron, `.env.example`, `.gitattributes` for LF.
- [x] CI: lint, typecheck, test on push.
- [ ] Deploy to Vercel at `meridian.appify.co.ke`: env vars, Payaza webhook URLs, migration on the hosted project, admin role. _Owner, after review._
- [ ] ngrok authtoken on this machine, tunnel running, webhook URL set in the Payaza dashboard for local testing. _Owner._

**H.6 Asks to Payaza** (hackathon PRD section 9, questions 8 to 10)
- [ ] Test payout float in KES and NGN.
- [ ] Enable GHS, UGX, TZS collections and the Bank Codes API on the test account.
- [ ] Confirm network codes beyond `SAFKEN`.

### Exit test
- [x] KES 650,000 request with invoice `AF-0917`; payer charged KES 670,104 by M-Pesa; sandbox approval; `awaiting_payin → collected → paying_out → settled`; request `paid`.
- [x] Second click makes attempt 2, not a duplicate of attempt 1.
- [x] Replayed webhook returns `duplicate`; nothing changes.
- [x] Late success on a paid single-use request is `held`, not paid out.
- [x] Third attempt on a paid request refused by the database.
- [x] Signed-in pages and admin render (`scripts/smoke-signed-in.ts`); webhook route rejects tampered and unsigned bodies.
- [ ] Real Transfer to M-Pesa in the sandbox. _Blocked on Payaza's test float._

---

## Phase 0 — Foundation

**Goal.** SolidStart app running with auth, database, email and hosting. Landing site and demos ported with parity. Lovable removed.

**Estimate.** 4 to 5 days.

### Tasks

**0.1 Project scaffold**
- [x] Create SolidStart TypeScript project. Strict mode. Tailwind v4. ESLint + Prettier from existing config. _SolidStart 2.0.5, Node 24._
- [x] Port `styles.css` design tokens and fonts.
- [x] Add Kobalte, lucide-solid, Zod, Supabase JS, Resend SDK, Vitest.
- [x] `package.json` name `meridian`. Replace README with a real one (setup, env, scripts).
- [x] Add `.env.example` with every variable from TRD 1.3.

**0.2 Hosting spike**
- [x] 2-hour spike: implement Klasha AES-CBC encryption in Workers runtime with `js-md5`. Round-trip a known payload. _Passed in local workerd and in Vitest._
- [x] Decide Cloudflare Workers vs Railway. Record decision in TRD. _Workers at the time. Superseded 28 September: production is Vercel at `meridian.appify.co.ke` (TRD 1.1). The Workers build still exists._
- [ ] Deploy to the production host. Set up custom domain. _Moves to Phase H.5: Vercel, after the owner's review._

**0.3 Supabase**
- [ ] Create dev project (or reuse). Upgrade prod project to Pro before Phase 3. _Open: the old Lovable project did not resolve from here. Local Supabase (`npx supabase start`) is set up and used for dev._
- [x] Migration: keep `waitlist_signups`, `contact_messages`, `demo_transactions`. Drop old `payment_requests` policies. Enable `pg_trgm`. _Applied locally. Push to the hosted project with `npx supabase db push`._
- [x] Server-side admin client in `src/server/supabase.ts`. Lint rule: service key import only under `src/server`.
- [x] Browser client with anon key.

**0.4 Auth**
- [x] Supabase email OTP sign-in page. Callback route. Session helper for server functions.
- [x] `/app/*` guard: redirect to sign-in without session. `/admin/*` guard: 404 without admin claim.
- [ ] Set Brian's user `app_metadata.role = 'admin'` in dashboard. Document the step. _Documented in the README. Setting it waits on the hosted project._

**0.5 Email**
- [ ] Verify sending domain in Resend. _Open: the Resend account has no domains yet. Needs DNS records on the sending domain._
- [x] `sendEmail()` with logging to `partner_calls` on failure and alert to `ADMIN_EMAIL`. _`partner_calls` created early for this._
- [x] Templates: waitlist confirm, contact confirm, lead alert.

**0.6 Port public pages**
- [x] Landing page with the copy from this release. Pricing calculator without FX line.
- [x] Terms, Privacy. Remove hard-coded effective date; use a constant.
- [x] Three demos and `/pay/{ref}` demo mode writing to `demo_transactions` only.
- [x] Waitlist and contact forms via server functions with IP rate limit and internal lead email (M-06, M-08).
- [x] Site header, footer, demo banner.

**0.7 Cleanup**
- [x] Delete TanStack sources, Lovable files, `@lovable.dev/*`, unused shadcn.
- [ ] Disconnect Lovable from the GitHub repo. Remove the `AGENTS.md` Lovable block. _Block removed. Disconnecting the Lovable GitHub app is still to do in GitHub settings._
- [x] CI: lint, typecheck, test on push.

### Exit test
- Staging URL serves landing, legal, three demos. Lighthouse mobile performance ≥ 85.
- Waitlist submit writes a row, emails the submitter and Brian.
- Sign in with OTP works. `/app` redirects when signed out. `/admin` 404s for a non-admin.
- `npm test` passes with at least the reference-generator and fee tests.
- Repo has no Lovable references.

---

## Phase 1 — Business onboarding and KYB

**Goal.** A business can sign up, fill its profile, upload documents, pass automated checks to Tier 1, and Brian can approve it to Tier 2 or 3.

**Estimate.** 5 to 6 days.

### Tasks

**1.1 Schema**
- [ ] Migration: `businesses`, `business_people`, `kyb_documents`, `kyb_checks`, `payout_accounts`. RLS per TRD 2.3.
- [ ] Storage bucket `kyb-docs`, private. Signed upload and read helpers.

**1.2 Onboarding flow (`/app/onboarding`)**
- [ ] Step 1 profile: name, trading name, country, registration number, tax number, address, website. Zod schema.
- [ ] Step 2 people: add directors and 25%+ owners with ID type and number, nationality.
- [ ] Step 3 documents: upload per type. Show which are needed for Tier 1 vs Tier 2. PDF/JPG/PNG, 10 MB.
- [ ] Step 4 review and submit. Sets `kyb_status = submitted`.
- [ ] Business can return and add documents any time. Re-submit triggers checks again.

**1.3 Automated checks (`src/server/kyb/checks.ts`)**
- [ ] Registration number format per country (KE, NG, GH, ZA, UG, TZ). Table of regexes.
- [ ] Document presence and type per tier.
- [ ] Duplicate identity: any `business_people.id_number` or `(country, registration_number)` on another business (R9).
- [ ] Geography: country and nationalities against FATF constant (R6).
- [ ] Email domain MX lookup.
- [ ] Sanctions screen: **stub in this phase** (always pass, marked `pending_lists`). Real screening arrives in Phase 2 and re-runs on all submitted businesses.
- [ ] Write one `kyb_checks` row per check. If all pass and Tier 1 docs present → `tier = 1`, `kyb_status = auto_passed`. Else `auto_failed` with reasons shown to the business.

**1.4 Payout account (`/app/settings/payout-accounts`)**
- [ ] Add bank or mobile money account. Validate with Kotani `validate-bank` / `validate-mobile-money` (sandbox). Create Kotani customer, store key.
- [ ] One default per currency.

**1.5 Business dashboard (`/app`)**
- [ ] Tier badge, limits, usage this month (zero for now), KYB status, next step to move up.

**1.6 Admin KYB (`/admin/kyb`)**
- [ ] Queue: submitted and auto_passed businesses, oldest first.
- [ ] Detail: profile, people, check results, documents with signed preview links.
- [ ] Actions: approve to Tier 2; approve to Tier 3 with custom limits; reject with note; freeze.
- [ ] Emails: "KYB submitted" to admin, decision email to business.

**1.7 Tests**
- [ ] Registration regexes per country.
- [ ] Duplicate detection.
- [ ] Tier assignment given check results and documents.

### Exit test
- New user signs up, completes profile with two directors, uploads incorporation cert and one ID. Lands on Tier 1 within a minute with all checks visible.
- Second business using the same director ID number fails auto-verification with R9 shown.
- Brian sees both in the queue, opens documents, approves the first to Tier 2. Business receives the email and dashboard shows Tier 2 limits.
- Payout account saved and validated against Kotani sandbox.

---

## Phase 2 — Compliance core

**Goal.** Sanctions data, screening, AML rules, limits, flag queue and held-transaction handling all exist and are tested before any money moves.

**Estimate.** 4 to 5 days.

### Tasks

**2.1 Schema**
- [ ] Migration: `sanctions_entries` with trigram index, `aml_flags`, `transactions`, `transaction_events`, `recipients`, `payment_requests` (new shape), `partner_calls`. RLS.

**2.2 Sanctions job**
- [ ] Parsers for OFAC SDN CSV, UN consolidated XML, EU XML, UK HMT CSV. Each returns `SanctionsEntry[]`.
- [ ] `/api/jobs/sanctions-refresh`: download, parse, insert with `list_version`, delete older versions, alert on failure.
- [ ] Cron trigger nightly.
- [ ] Run once by hand. Record row counts.

**2.3 Screening**
- [ ] `screenName(name): ScreeningResult` with normalisation and trigram similarity.
- [ ] Wire into KYB checks (replace stub). Re-run for every submitted business.
- [ ] Wire into recipient save.

**2.4 Limits**
- [ ] `limits.ts` with tier table and `checkLimit(business, usdAmount)` using a single usage query.
- [ ] USD equivalent helper using Kotani public rate.

**2.5 Rules engine**
- [ ] `rules.ts` pure functions R1 to R10 per PRD 5.5.
- [ ] `evaluate(context) → RuleHit[]` and `strongestAction(hits)`.
- [ ] Context loader: business, tier, last 30 days of transactions, recipient, screening results.
- [ ] Every hit writes an `aml_flags` row.

**2.6 Admin flags (`/admin/flags`)**
- [ ] Queue: open flags, high first. Detail with evidence JSON rendered readably.
- [ ] Actions: clear, escalate, and for held transactions: release or reject.
- [ ] Freeze / unfreeze business.
- [ ] CSV export for a date range (flags, transactions).
- [ ] High-severity flag emails admin.

**2.7 Business-facing**
- [ ] Limit exceeded message with current usage and how to raise tier.
- [ ] Held transaction message: "Under review. We will email you within one business day."

**2.8 Tests**
- [ ] One positive and one negative test per rule.
- [ ] Screening: exact, alias, transliteration near-miss, clean name.
- [ ] Limits at every boundary.
- [ ] Parser tests with a fixture row from each list.

### Exit test
- Sanctions table holds all four lists. A known SDN name (e.g. a listed entity) scores a match; a common Kenyan business name does not.
- A test business with a director named after an SDN entry fails KYB with R1.
- A simulated transaction sequence (three payments at 80% of the Tier 1 limit in one hour) produces an R4 hold and appears in the flag queue. Brian releases it.
- CSV export downloads and opens.

---

## Phase 3 — Collect

**Goal.** A Tier 1+ business creates payment links, embeds a checkout, gets paid via Kotani sandbox, and receives an automatic payout. Real webhooks, real state machine.

**Estimate.** 6 to 7 days.

### Tasks

**3.1 Kotani client**
- [ ] `kotani.ts`: typed wrappers for customers, deposits (momo, bank checkout, card), withdrawals (momo, bank), rate/fiat, rate/public, validation. Every call logged to `partner_calls` with secrets stripped.
- [ ] Sandbox scenarios: use Kotani's reserved test numbers for success, failure, timeout.

**3.2 Payment requests (`/app/collect`)**
- [ ] Create: fixed or open amount, currency, memo, single/multi, expiry, optional payer email.
- [ ] List with status, paid count, copy link, disable.
- [ ] Email to payer when address given.

**3.3 Hosted pay page (`/pay/{ref}`)**
- [ ] Server function loads request by reference. States: not found, expired, disabled, paid (single), active.
- [ ] Active: amount (or input), method choice by currency, payer name, email, phone for momo.
- [ ] Fee preview: Kotani quote for collect leg + Meridian 1%. Shows what the business receives.
- [ ] Submit: create transaction, run rules (payer name R1, geography R6, business limits R2), call Kotani deposit. Redirect to checkout URL for bank/card. Poll status page for momo.
- [ ] `?embed=1` mode: minimal chrome, `postMessage` on settle and close, `frame-ancestors *`.

**3.4 Webhook (`/api/webhooks/kotani`)**
- [ ] Signature verification. Idempotency via `transaction_events`.
- [ ] Deposit SUCCESSFUL → `collected`, store amounts. If held, stop. Else initiate payout to default payout account → `paying_out`.
- [ ] Withdrawal SUCCESSFUL → `settled`. Emails. Update payment request.
- [ ] FAILED on either leg → `failed`, flag, email business and admin.

**3.5 Payout retry job**
- [ ] `/api/jobs/payout-retry` every 10 minutes: `collected` transactions older than 10 minutes with no payout ref, not held → retry once, then flag.

**3.6 Embed script**
- [ ] `/embed.js` route. Button, modal iframe, message relay, new-tab fallback.
- [ ] Test page in `/demo/embed` that shows the script working.

**3.7 Business views**
- [ ] `/app/transactions` list and `/app/transactions/[id]` timeline from `transaction_events`.
- [ ] Dashboard usage numbers now live.

**3.8 Tests**
- [ ] Signature verification.
- [ ] Idempotency: same webhook twice → one event.
- [ ] Quote builder from Kotani fiat response.
- [ ] State machine transitions: valid and invalid.

### Exit test
- Business creates a KES 1,000 link. Payer opens it, pays via sandbox M-Pesa test number. Transaction moves `awaiting_payin → collected → paying_out → settled` visible in the timeline. Both receive receipts.
- Same flow via embed on a plain HTML page. Parent page receives `meridian:paid`.
- Failure test number produces `failed`, a flag, and two emails.
- Duplicate webhook delivery causes no double payout.
- Tier 1 business attempting a USD 600 equivalent link is blocked with the limit message.

---

## Phase 4 — Send

**Goal.** A Tier 1+ business pays a supplier in Africa (Kotani), China (Klasha CNY) or by wire (Klasha), funding each transfer by mobile money or bank.

**Estimate.** 7 to 8 days.

### Tasks

**4.1 Klasha client**
- [ ] Auth with token cache. Encryption helper (from Phase 0 spike). Every call logged.
- [ ] CNY: quotation, bank codes, file upload, transfer request, status.
- [ ] Wire: beneficiary create, quote, initiate, fetch by reference.
- [ ] Payout per African currency where Klasha is the fallback (NGN, GHS, TZS bank).

**4.2 Recipients (`/app/send/recipients`)**
- [ ] Add recipient: country → currency → method → method-specific fields (Zod per method). Klasha CNY B2B fields, wire fields (SWIFT, IBAN, address).
- [ ] Screen on save (R1, R6). Validate with Kotani where applicable. Create Klasha beneficiary for wire recipients, store token.

**4.3 New transfer (`/app/send/new`)**
- [ ] Pick recipient, enter send amount. Server function: routing → quote → `Quote` → rules → transaction `quoted` / `held` / `blocked`.
- [ ] Confirm screen: amount, partner fee(s), Meridian fee, total charged, recipient gets, expiry countdown. No rate shown as a headline; the recipient amount is the promise.
- [ ] Trade documents upload for CNY B2B (invoice, customs). Stored in `trade-docs`, uploaded to Klasha, `fileId` kept.
- [ ] Confirm → `awaiting_payin` → Kotani STK to business phone or bank checkout redirect.

**4.4 Payout leg**
- [ ] On deposit SUCCESSFUL: route payout. Kotani withdrawal, or Klasha CNY transfer, or Klasha wire initiate. `paying_out`.
- [ ] Klasha quote expired → re-quote. If recipient amount drops more than 1%, hold and email business to re-confirm.
- [ ] Klasha webhook `/api/webhooks/klasha`: treat as hint, confirm via status API, then update.
- [ ] Payout SUCCESSFUL → `settled`, emails. FAILED → `failed`, high flag, admin manual refund path, `refunded` action in admin.

**4.5 Status page**
- [ ] `/app/transactions/[id]` shows transfer timeline: quoted, paid in, converting, paying out, settled. Partner references shown for support.

**4.6 Operations**
- [ ] Fund Klasha USD wallet in dev/sandbox. Document the funding procedure for production.
- [ ] Quote cleanup job hourly.

**4.7 Tests**
- [ ] Klasha encryption round-trip against a known vector.
- [ ] Quote builder from Klasha CNY and wire responses.
- [ ] Routing table: every (currency, method) maps to exactly one partner.
- [ ] Re-quote drift rule (1%).

### Exit test
- KES → GHS mobile money transfer completes in Kotani sandbox end to end.
- KES → CNY Alipay transfer completes in Klasha dev end to end, with a document attached.
- KES → USD wire quote and initiate succeed in Klasha dev; status polls to a terminal state.
- Recipient named after an SDN entry is blocked on save.
- A transfer to a recipient added today for ≥ USD 5,000 equivalent produces an R7 flag but proceeds.

---

## Phase 5 — Launch hardening

**Goal.** Production credentials, legal sign-off, monitoring, and a pilot with the interviewees.

**Estimate.** 4 to 5 days plus partner lead times.

### Tasks

**5.1 Production partners**
- [ ] Kotani production API key, webhook secret, wallets for KES (and EUR if confirmed). Fee arrangement confirmed and recorded in TRD.
- [ ] Klasha production merchant account for Appify. Wallets funded.
- [ ] Switch `MERIDIAN_MODE=live` on production only. Banner off.

**5.2 Legal and policy**
- [ ] Written AML/KYB policy document (tiers, rules, review SLA, retention, STR procedure). Lawyer review.
- [ ] Terms and Privacy updated for live service, partner names, data retention.
- [ ] Partner disclosure page or FAQ entry naming Kotani Pay and Klasha.

**5.3 Monitoring**
- [ ] Error alerts to admin email for any 5xx, webhook signature failure, job failure.
- [ ] Daily summary email: transactions by status, open flags, KYB queue size.
- [ ] Supabase Pro with PITR on production.

**5.4 Security pass**
- [ ] Verify no service key or partner secret reaches the client bundle.
- [ ] RLS test script: sign in as business A, attempt to read business B's rows via anon client, expect zero rows.
- [ ] `npm audit` clean or documented.

**5.5 Pilot**
- [ ] Onboard McLoud, Phillip, Richard, Chris manually with Tier 2 or 3 as appropriate.
- [ ] First live transaction with a small amount per business.
- [ ] Collect feedback. Log issues.

**5.6 Marketing site**
- [ ] Replace "under development" banners with "early access". Waitlist becomes sign-up CTA for approved countries.
- [ ] Demo pages stay as sandbox.

### Exit test
- One live collection and one live transfer completed with real money at small value.
- Brian receives the daily summary.
- RLS test passes. Bundle scan passes.
- Lawyer has signed off on AML policy and Terms.

---

## Timeline

| Phase | Estimate | Cumulative |
|---|---|---|
| 0 Foundation | 4 to 5 days | Week 1 |
| 1 Onboarding and KYB | 5 to 6 days | Week 2 |
| 2 Compliance core | 4 to 5 days | Week 3 |
| 3 Collect | 6 to 7 days | Week 4 to 5 |
| 4 Send | 7 to 8 days | Week 6 to 7 |
| 5 Launch hardening | 4 to 5 days + partner lead time | Week 8 |

Roughly eight working weeks for one developer. Partner onboarding (production keys, Klasha merchant approval) should start in week 1 because it runs in parallel and often takes longest.

## Not in any phase

Wallets, teams, bulk payouts, recurring payments, invoicing, mobile app, public API, OCR, paid KYB providers, multiple payout accounts per currency. Revisit after pilot feedback.
