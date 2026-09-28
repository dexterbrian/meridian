# Meridian — Product Requirements Document

| Field | Value |
|---|---|
| Product | Meridian |
| Owner | Appify Softwares Limited, Nairobi, Kenya ([appify.co.ke](https://appify.co.ke)) |
| Repo | https://github.com/dexterbrian/meridian |
| Status | Pre-launch. Marketing site + waitlist + three simulated demos are live. MVP scope defined here. |
| Document version | 0.4 (payer pays fees, invoice numbers, idempotency) |
| Date | 28 September 2026 |
| Related | [Customer interviews](./customer-interviews.md) · [TRD](./trd.md) · [Phases](./phases.md) · [Payaza hackathon PRD](./payaza-hackathon-prd.md) |

---

## 1. Summary

Meridian is a B2B payments platform for businesses in Africa that trade across borders. A business can collect money from customers (in Africa or abroad) and pay suppliers (in Africa or abroad). Money lands in minutes, not days. Pricing is a flat 1% Meridian fee on top of the licensed partner's disclosed fee. Meridian does not charge for currency conversion and does not mark up the rate.

Meridian does not hold customer funds. Licensed infrastructure partners (Kotani Pay, Klasha) collect, convert, hold and pay out. Meridian is the technology layer: onboarding, compliance, quotes, checkout, tracking and receipts.

**Tagline:** "African money in motion."

### 1.1 MVP in one paragraph

A Kenyan importer signs up, uploads registration documents, and can start with small payments the same day. They create a payment link or embed a checkout to collect from customers anywhere. They pay a supplier in China, Ghana or Germany from one screen. Every payment shows the partner fee and Meridian's 1% before confirm. Automated AML rules flag anything unusual for Brian to review. Nothing else.

---

## 2. Problem

Four linked pains, confirmed in five customer interviews.

| Pain | Evidence |
|---|---|
| Money stuck in transit | McLoud (Equity, Co-op banks): 4 to 5 days to confirm. Chris: 2 to 3 days from Europe, Middle East banks closed Fridays. |
| Fees eat margin | McLoud: 8 to 10% all-in. Banks give poor FX on KES accounts. |
| Customers cannot pay easily | Bright's South Sudan client flew to Nairobi to pay in person. Chris's buyers wait days on AML paperwork. |
| No cost visibility | McLoud exchanges cash with a Forex agent to get a fair rate. |

### 2.1 Interview findings that shape scope

| Finding | Implication for MVP |
|---|---|
| Most interviewees pay suppliers outside Africa (US, China, Japan, UK, Dubai). Exporters receive from Europe and Middle East. | Corridors are Africa ↔ Africa **and** Africa ↔ global from day one. Niche down later with data. |
| Pain depends on bank. StanChart users are fine. Equity / Co-op users are not. | Target importers on mid-tier banks first. |
| Late payment costs more than fees (cold storage, stockouts, unpaid farmers). | Settlement time is the headline metric. |
| Inbound collection is a real second use case. | Payment links and embeddable checkout are MVP, not later. |
| Trust gates adoption. McLoud wants security assurances first. | Partner disclosure, clear KYB, visible compliance. |
| Banks lose days on document checks. | Fast, tiered KYB is a differentiator. |
| McLoud's switch trigger: 40% lower fees plus faster. | 1% + partner fee must land well under 8 to 10%. |

---

## 3. Users

| User | Who | What they do in Meridian |
|---|---|---|
| **Business owner** (primary) | Kenyan SME importer or exporter. Later: NG, GH, ZA, UG, TZ. | Signs up, completes KYB, creates payment links, embeds checkout, pays suppliers, reads receipts. |
| **Payer** (secondary) | The business's customer, anywhere. No account. | Opens a link or checkout, pays by mobile money, bank or card. |
| **Recipient** (secondary) | The business's supplier, anywhere. No account. | Receives local currency in bank, mobile money, Alipay or wire. |
| **Admin** (internal) | Brian. | Reviews KYB submissions, clears AML flags, watches transactions. |

---

## 4. Current state (what exists in the repo)

### 4.1 Stack

**Current (Lovable-generated, to be replaced)**
TanStack Start, React 19, Vite, Tailwind v4, shadcn/ui, Supabase (anon key only), Resend via Lovable gateway. Hosted on Lovable.

**Target (decided 22 Sep 2026)**
SolidStart + TypeScript, Tailwind v4, Supabase (Auth, Postgres, Storage, RLS), Resend direct. Details in [TRD](./trd.md).

### 4.2 Routes today

| URL | Purpose |
|---|---|
| `/` | Landing page: hero, pain, solution, demos, pricing calculator, how it works, waitlist, contact, FAQ |
| `/demo/checkout` | Simulated customer checkout |
| `/demo/send` | Simulated cross-border transfer with animated stages |
| `/demo/request` | Create a demo payment link |
| `/pay/$reference` | Payer side of a demo link |
| `/terms`, `/privacy` | Legal |

### 4.3 Data today

Four open Supabase tables: `waitlist_signups`, `contact_messages`, `payment_requests`, `demo_transactions`. No auth. Full detail in TRD section 2.

### 4.4 Pricing engine today (`src/lib/fees.ts`)

Hard-coded partner fees (bank 1%, momo 2%, card 2.5%), Meridian 1%, and a 0.35% FX spread line. **The FX line is wrong** and is removed from copy in this release. See 5.3.

---

## 5. Product definition (MVP)

### 5.1 Core promise

- Collect from customers and pay suppliers, in Africa and abroad, from one account.
- Money lands in minutes where the partner supports instant rails.
- Flat 1% Meridian fee plus the partner's fee. Both shown before confirm.
- No Meridian FX charge. No rate markup.
- Local currency in, local currency out. No crypto shown to the user.
- Start small the same day. Higher limits after document review.

### 5.2 Corridors and partners

| Leg | Partner | Methods | Notes |
|---|---|---|---|
| Collect in Africa (KES, NGN, GHS, ZAR, UGX, TZS) | Kotani Pay | Mobile money (STK push), bank checkout, card | Primary. Hosted payment links available too. |
| Pay out in Africa | Kotani Pay | Mobile money, bank | Bank payout coverage varies by country. Klasha as fallback for NGN, GHS, KES, ZAR, TZS bank. |
| Collect EUR from Europe | Kotani Pay | Card, bank | Owner's decision. EUR coverage must be confirmed with Kotani. |
| Settle EUR to Europe | Kotani Pay | Bank | Same. Klasha Wire as fallback (EUR to 20+ EU countries). |
| Pay out to China | Klasha | Alipay, UnionPay card, bank (B2B) | B2B bank needs invoice, customs docs. Klasha quote locks rate and fee. |
| Pay out to Japan, HK, UAE, India, UK, US | Klasha Wire | Bank wire | JPY, HKD, AED, INR, GBP, USD. Quote valid until rate changes. |

**Launch order** (from interview demand): KES collections first. Payouts to CNY (McLoud), JPY (Phillip), USD (Richard), then NGN/GHS/UGX/TZS (Africa-Africa), then EUR (Chris).

### 5.3 Pricing and FX stance

| Item | Rule |
|---|---|
| Who pays fees | The payer, on top. Fees are charged on what the payer pays, so the total is grossed up: payer total = amount ÷ (1 − fee rate). The business collecting, or the supplier being paid, gets the exact amount. Example: USD 36,000 by card (2.5% + 1%) costs the payer USD 37,305.70. |
| Meridian fee | Flat 1% of what the payer pays. |
| Partner fee | Whatever the partner quotes. Shown as its own line. Two legs on cross-border (collect leg, payout leg). |
| FX | Meridian adds nothing. The partner's quote already includes their rate. |
| What the user sees at confirm | Amount, partner fee(s), Meridian fee, total cost, **what the payer pays** and **what the recipient gets** in their currency. Quote expiry shown. On a pay page, fees read 0 until the payer picks a method. |
| What marketing copy says | Never a rate, never a spread percentage. Only: "Exchange rate from our licensed partner, shown before you confirm." |

The current site's "mid-market + 0.35%" copy is removed in this release.

### 5.4 Business onboarding and KYB

Tiered, risk-based. A business can move small amounts before full review. This is FATF-endorsed practice (simplified due diligence for low-risk, low-value; enhanced for higher).

| Tier | How you get there | Per transaction | Rolling 30 days | Count / 30 days |
|---|---|---|---|---|
| **0 Registered** | Email verified. Business name, country, registration number, one director name. | No transactions | — | — |
| **1 Starter** | Tier 0 + certificate of incorporation/registration + one director's government ID uploaded. Automated checks pass. | USD 500 equivalent | USD 2,000 | 10 |
| **2 Verified** | All documents uploaded (see list). Brian reviews and approves. | USD 10,000 | USD 50,000 | Unlimited |
| **3 Enhanced** | Tier 2 + source of funds, recent bank statement, trade documents. Brian approves per business. | Set per business. Default USD 50,000 | Default USD 250,000 | Unlimited |

**Required documents for Tier 2**
1. Certificate of incorporation or business registration
2. Tax registration certificate (KRA PIN in Kenya, TIN elsewhere)
3. Proof of business address, under 3 months old
4. Government ID for every director
5. Ownership declaration listing anyone who owns 25% or more

**Automated checks** (run on submit, result stored, business marked `auto_passed` or `auto_failed`)
1. Registration number matches the country's format.
2. Business name, every director name and every 25%+ owner screened against OFAC SDN, UN consolidated, EU and UK sanctions lists. Lists are free downloads, refreshed nightly.
3. Director ID number and registration number not already used by another Meridian business.
4. Business country and director nationality not on the FATF blacklist.
5. Every required file present, correct type, under size limit, not empty.
6. Business email domain has mail records (MX lookup). Free-mail domains allowed but noted.

No free API exists for Kenya's Business Registration Service, Nigeria's CAC or Ghana's RGD. Auto-verification is therefore a gate, not proof. Manual review carries the weight for Tier 2. Paid verification (Smile ID, Youverify) is a later option.

**Why these numbers**
- Tier 1 sits far below the USD 10,000 cash reporting threshold in Kenya's POCAMLA and comparable thresholds elsewhere.
- Tier 1 covers McLoud's small client orders (KES 50k to 100k). Tier 2 covers Phillip's car imports (KES 900k to 1.2M) and McLoud's stock orders. Tier 3 covers Chris (USD 35k to 40k per shipment).
- Meridian's limits must sit inside whatever Kotani Pay and Klasha impose on Meridian as their integrator. Confirm with both.

**Advice.** Tiering is best practice and lowers friction. Three cautions. First, Meridian is not the licensed entity, but it still needs a written AML policy, a named compliance officer (Brian) and 7-year record retention (POCAMLA s.46). Second, dedupe on director ID so one person cannot open five Tier 1 businesses. Third, have a compliance lawyer read the policy before real money moves.

### 5.5 AML rules

Rules run in code on every relevant event. Each hit writes a flag. Some rules block, some hold the transaction until cleared, some let it proceed and just record.

| # | Rule | Trigger | Action |
|---|---|---|---|
| R1 | Sanctions match | Business, director, owner, recipient or payer name matches a sanctions list | **Block** + flag (high) |
| R2 | Tier limit | Transaction exceeds per-transaction, 30-day volume or 30-day count for the tier | **Block**. User sees the limit and how to raise it. Logged. |
| R3 | Large transaction | Single transaction ≥ USD 10,000 equivalent | Flag (medium). Proceeds. |
| R4 | Structuring | 3 or more transactions in 24 hours, each between 70% and 100% of the per-transaction limit | **Hold** + flag (high) |
| R5 | Velocity | More than 10 transactions in 24 hours, or 30-day volume more than 3× the previous 30-day volume (after 60 days of history) | Flag (medium). Proceeds. |
| R6 | High-risk geography | Payer or recipient country on FATF blacklist | **Block**. Grey list: **Hold** + flag. |
| R7 | New recipient, large first payment | First transfer to a recipient ≥ USD 5,000 equivalent | Flag (low). Proceeds. |
| R8 | Pass-through | A collection followed within 24 hours by a transfer of ≥ 90% of that amount to a recipient added in the last 7 days | **Hold** + flag (high) |
| R9 | Duplicate identity | Director ID or registration number already on another business | Auto-verification fails. Flag (high). |
| R10 | Re-screen | Nightly sanctions refresh matches an existing business or recipient | Freeze business + flag (high) |

**Held transactions** stay in `held` until Brian clears or rejects them. Rejected transactions that already collected money are refunded through the partner dashboard by hand in MVP. Every flag records rule, evidence, reviewer, decision, timestamp. Exportable as CSV for regulator requests.

### 5.6 Money movement (no stored balance)

The MVP has **no wallet and no stored balance**. Every transaction is funded and settled end to end. This keeps Meridian clear of e-money rules, removes a ledger to reconcile, and matches how interviewees think ("I pay for this order").

**Collect** (payment link or embedded checkout)
1. Business creates a link: amount (or payer-enters-amount), currency, its own invoice number (optional), memo, single or multi use. Meridian gives it a reference like `MRD-VNN6FG3X`.
2. Payer opens the hosted page, picks a method, pays. Partner collects.
3. Partner webhook says paid. Meridian records it and runs AML.
4. Meridian instructs partner to pay the business's registered payout account the full requested amount. The payer already covered the fees.
5. Both sides get a receipt email showing the invoice number and the Meridian reference.

**Send** (pay a supplier)
1. Business picks a saved recipient, enters amount, sees the partner quote (fees, what the recipient gets, expiry).
2. AML runs. Blocked, held or proceeds.
3. Business pays in: mobile money STK push or bank checkout via the partner.
4. Partner webhook says collected. Meridian instructs payout via Kotani (Africa) or Klasha (China, wires).
5. Payout webhook says done. Business gets a receipt. Recipient gets a notification if email given.

Meridian's 1% accumulates in the partner wallet. Partner settles to Appify's bank on their schedule. This is outside the product.

### 5.7 Embeddable checkout and payment links

One primitive: a **payment request**. It has an optional fixed amount, a currency, an optional invoice number, a memo, and single or multi use. It gets a short reference and a hosted page at `/pay/{reference}`.

**References.** Businesses make their own invoices. Meridian stores the business's invoice number as given (free text, not unique, since one invoice can be paid in parts) and shows it on the pay page, receipts, dashboard and exports. Meridian adds its own unique reference, `MRD-` plus 8 characters, to every request. Each attempt to pay gets its own partner reference built from it (`MRD-VNN6FG3X-1`), so retries and webhooks can be matched exactly.

| Surface | What it is |
|---|---|
| Payment link | The hosted page URL. Share by email, WhatsApp, invoice. |
| Embeddable checkout | A `<script>` tag with the reference. Renders a "Pay with Meridian" button. Click opens the hosted page in a modal iframe. On completion the page posts a message to the parent so the merchant site can react. If the iframe is blocked, it opens a new tab. |
| Multi-use, payer-enters-amount link | Acts as a generic "pay us" page for a business. |

No plugin, no SDK, no per-framework packages. One script, one hosted page.

### 5.8 Out of scope for MVP

Wallets and balances. Team members and roles (one owner per business). Bulk payouts. Recurring payments. Generating invoices (businesses keep their own; Meridian stores their invoice number). Mobile app. API for third parties. Multiple currencies per business payout account (one payout account per currency, added on demand). OCR of documents. Paid KYB providers.

---

## 6. Functional requirements

IDs use the `M-` prefix. Status: **Done**, **Not started**. Priority: **Must** (MVP) or **Later**.

### 6.1 Marketing site

| ID | Requirement | Priority | Status |
|---|---|---|---|
| M-01 | Landing page: problem, solution, pricing, how it works, FAQ | Must | Done |
| M-02 | Pricing calculator without FX line | Must | Done (this release) |
| M-03 | Waitlist form → table + confirmation email | Must | Done |
| M-04 | Contact form → table + confirmation email | Must | Done |
| M-05 | Terms and Privacy | Must | Done |
| M-06 | Internal email to Appify on new waitlist / contact entry | Must | Not started |
| M-08 | Rate limit on public forms | Must | Not started |
| M-09 | Verified Resend sending domain | Must | Not started |
| M-11 | Copy targeted at importers/exporters, Africa ↔ Africa and Africa ↔ global | Must | Done (this release) |

### 6.2 Accounts and KYB

| ID | Requirement | Priority | Status |
|---|---|---|---|
| M-20 | Sign up / sign in with email (magic link or OTP) | Must | Not started |
| M-21 | Business profile: name, country, registration number, directors, owners | Must | Not started |
| M-22 | Document upload to private storage, per document type | Must | Not started |
| M-23 | Automated checks (5.4) run on submit; result and evidence stored | Must | Not started |
| M-24 | Tier assignment and limit enforcement (5.4 table) | Must | Not started |
| M-25 | Admin KYB queue: view business, view documents, approve to Tier 2/3, reject with note | Must | Not started |
| M-26 | Business sees tier, limits, usage this month, and what to upload to move up | Must | Not started |
| M-27 | Payout account per business: bank or mobile money, validated with partner's validation endpoint | Must | Not started |

### 6.3 Compliance

| ID | Requirement | Priority | Status |
|---|---|---|---|
| M-30 | Sanctions lists (OFAC, UN, EU, UK) downloaded nightly into a table | Must | Not started |
| M-31 | Name screening with fuzzy match for business, directors, owners, recipients, payers | Must | Not started |
| M-32 | AML rules R1 to R10 (5.5) | Must | Not started |
| M-33 | Flag queue for admin: open, cleared, escalated; reviewer note | Must | Not started |
| M-34 | Held transaction state and admin release / reject | Must | Not started |
| M-35 | CSV export of flags and transactions for a date range | Must | Not started |
| M-36 | FATF black / grey list as a versioned constant, reviewed quarterly | Must | Not started |

### 6.4 Collect

| ID | Requirement | Priority | Status |
|---|---|---|---|
| M-40 | Create payment request: amount or open, currency, business invoice number (optional), memo, single/multi use, expiry | Must | Not started |
| M-41 | Hosted pay page: method choice, partner fee + Meridian fee shown, pay | Must | Not started |
| M-42 | Kotani deposit integration: mobile money STK, bank checkout, card | Must | Not started |
| M-43 | Webhook handler with signature verification, idempotent | Must | Not started |
| M-44 | Auto payout to business payout account after collection settles | Must | Not started |
| M-45 | Embed script: button → modal iframe → completion message | Must | Not started |
| M-46 | Receipts by email to payer and business | Must | Not started |
| M-47 | Business dashboard: list of requests, status, who paid | Must | Not started |
| M-48 | EUR card / bank collection via Kotani | Must (once confirmed) | Not started |
| M-49 | Invoice number and Meridian reference on pay page, receipts, dashboard and CSV; dashboard searchable by either | Must | Not started |

### 6.5 Send

| ID | Requirement | Priority | Status |
|---|---|---|---|
| M-50 | Saved recipients: name, country, currency, method, account details. Screened on save. | Must | Not started |
| M-51 | Quote from partner (Kotani fiat-to-fiat or Klasha quotation) with expiry | Must | Not started |
| M-52 | Pay-in via Kotani mobile money or bank checkout | Must | Not started |
| M-53 | Payout via Kotani (Africa) | Must | Not started |
| M-54 | Payout via Klasha CNY (Alipay, UnionPay, bank B2B with docs) | Must | Not started |
| M-55 | Payout via Klasha Wire (USD, JPY, GBP, EUR, AED, HKD, INR) | Must | Not started |
| M-56 | Transfer status timeline: quoted → paying in → collected → paying out → settled / failed | Must | Not started |
| M-57 | Failed payout: flag to admin, manual refund path documented | Must | Not started |
| M-58 | Trade document upload attached to a transfer (needed for Klasha CNY B2B) | Must | Not started |

### 6.6 Platform

| ID | Requirement | Priority | Status |
|---|---|---|---|
| M-60 | SolidStart rewrite of landing, legal, demos | Must | Not started |
| M-61 | Solid UI primitives (Kobalte) replacing shadcn/React | Must | Not started |
| M-62 | Vitest with tests for fees, AML rules, limit checks, webhook verification | Must | Not started |
| M-63 | Scheduled jobs: sanctions refresh, stale quote cleanup, payout retry | Must | Not started |
| M-64 | Structured server logging, error alerts to email | Must | Not started |
| M-65 | Sandbox mode toggle: whole app runs against partner sandboxes | Must | Not started |
| M-66 | Idempotency on every money step (7.1): create request, pay attempt, send, webhook, payout | Must | Not started |

---

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | No service-role key in the browser. RLS on every table. A business reads only its own rows. Admin role via Supabase JWT claim. Partner secrets server-side only. Webhook signatures verified. |
| Compliance | Tiered KYB before money moves. AML rules on every transaction. 7-year retention of KYB documents, flags, transactions, webhook payloads. |
| Reliability | Idempotent throughout (7.1). Every partner call logged with request and response. |
| Cost | One SolidStart app, one Supabase project, one Resend account. No queues, no extra services. Target under USD 50 / month before volume. |
| Performance | Landing under 2s on 3G. Quote under 3s (partner-bound). |
| Observability | Every partner error and every email failure logged and alerted. No swallowed errors. |
| History | No force-push on `main` while Lovable is connected. Disconnect Lovable after the SolidStart rewrite lands. |

### 7.1 Idempotency

Doing the same thing twice must have the same effect as doing it once. Nobody is charged twice. Nobody is paid twice. This holds when a button is double-clicked, a request is retried, or a partner sends the same webhook again.

| Where a repeat can happen | Rule |
|---|---|
| Create a payment request or a transfer | The client sends an idempotency key. The same key returns the first result. |
| Payer pays, or business pays in | A paid request or funded transfer can't be paid again. Each attempt's partner reference is saved before the partner call. A retry reuses it. |
| Partner webhook | Matched on partner reference and status. A repeat is logged and ignored. One event, one change of state. |
| Payout | One payout per collection or transfer, enforced by a unique constraint. A timed-out payout is checked by status query before any retry, with the same reference. |

---

## 8. Known gaps in current code

1. `payment_requests` open to anon read and update on every row.
2. FX 0.35% line contradicts pricing stance (copy fixed this release; code fix lands with rewrite).
3. Email failures swallowed. Sandbox sender.
4. No spam protection on public forms.
5. No internal notification of leads.
6. Hard-coded rates and fees.
7. Insert errors ignored in two demos.
8. Dead Lovable scaffolding, unused shadcn components, template README and package name.
9. No tests.

All are addressed by the rewrite rather than patched in TanStack.

---

## 9. Decisions and open questions

**Decided**
- Stack: SolidStart + TypeScript, Supabase, Resend. (22 Sep)
- No Meridian FX charge. No rate in marketing copy. (22 Sep)
- Partners: Kotani Pay (Africa, EUR), Klasha (Asia, global wires). (22 Sep)
- Corridors: Africa ↔ Africa and Africa ↔ global. Niche later. (22 Sep)
- KYB: 4 tiers as in 5.4. AML: rules R1 to R10. (22 Sep, proposed here, owner to confirm)
- No stored balance in MVP. (Proposed here, owner to confirm)
- Embeddable checkout = one script + hosted page. (22 Sep)

**Open**
1. Confirm with Kotani Pay: EUR collection (card, bank) and EUR payout coverage, and what KYB they require of Meridian's customers versus Meridian itself.
2. Confirm with Klasha: merchant onboarding for a Kenyan entity, CNY B2B document requirements in practice, and wire fees per corridor.
3. Confirm the tier limits in 5.4 or adjust.
4. Confirm "no stored balance" for MVP.
5. ~~Hosting.~~ Decided 28 September 2026: Vercel, production at `meridian.appify.co.ke`. The Cloudflare Workers build from Phase 0 stays as an option. See TRD 1.1.
6. Sending domain for Resend.
7. Legal review of Terms, Privacy and AML policy before live.
8. Payaza as a collections partner. The hackathon build (see [Payaza hackathon PRD](./payaza-hackathon-prd.md)) runs collections and payouts on Payaza end to end against its sandbox. Decide after the hackathon whether it joins or replaces Kotani Pay for collections.

---

## 10. Next steps

1. Owner reviews this PRD, the [TRD](./trd.md) and [Phases](./phases.md).
2. Owner opens sandbox accounts with Kotani Pay and Klasha and sends the open questions to both.
3. On approval, start Phase 0 (SolidStart foundation).
4. In parallel: chase McLoud's transaction data and run the savings simulation.
