# Meridian — Product Requirements Document

| Field | Value |
|---|---|
| Product | Meridian |
| Owner | Appify Softwares Limited, Nairobi, Kenya ([appify.co.ke](https://appify.co.ke)) |
| Repo | https://github.com/dexterbrian/meridian |
| Status | Pre-launch. Marketing site + waitlist + three simulated demos are live. Core product is not built. |
| Document version | 0.1 (first draft from codebase review) |
| Date | 21 September 2026 |

---

## 1. Summary

Meridian is a planned B2B payments platform for African businesses. It lets a business send money to suppliers and collect money from customers, locally and across African borders, in minutes rather than days. Pricing is a flat 1% Meridian fee on top of a disclosed infrastructure partner fee. Settlement uses stablecoins as an internal rail, but users only ever see their local currency.

Meridian does not hold funds. Licensed financial infrastructure partners collect, convert, hold and pay out. Meridian is the technology layer.

**Tagline:** "African money in motion."
**Positioning line:** "Payments that flow like they should."

This document does two jobs:

1. Describes what exists today in the repo (Section 4).
2. Captures what the site promises as the real product, so the team can decide what to build next (Sections 5 to 9).

---

## 2. Problem

African businesses that trade across borders face four linked problems. These are quoted from the landing page because they are the agreed pitch.

| Pain | Description |
|---|---|
| Cash stuck in limbo | "A supplier payment sent Friday lands Wednesday. Production stops, containers sit at the port, and you pay demurrage on money you already sent." |
| Fees eat margin | "8–12% disappears between correspondent banks, FX spread and 'processing'. On $50,000 a month that is a salary you are paying to move your own money." |
| Customers cannot pay easily | "A buyer in Accra wants to pay your Kampala invoice. Between them sits a bank branch, a form, a swift code and a week of follow-up. Some of them simply do not pay." |
| No cost visibility | "The quoted fee is not the real fee. The rate is not the mid-market rate. You only learn the true cost when the money lands short." |

---

## 3. Users

### Primary: African SME / trading business (the account holder)
- Pays suppliers in other African markets.
- Collects from customers in other African markets.
- Thinks in local currency (NGN, KES, GHS, ZAR, UGX, TZS) or USD.
- Wants speed, transparent cost, and a mobile-money-like experience.
- Example personas used in the demos: "Savanna Textiles Ltd" (Lagos) paying "Accra Packaging Co." (Accra).

### Secondary: the payer / customer
- Receives a checkout page or a payment-request link from a Meridian business.
- Pays by bank transfer, mobile money or card.
- Does not need a Meridian account.

### Internal: Appify team
- Reads waitlist and contact submissions.
- Decides launch corridors based on waitlist data.
- Currently has no admin UI. Reads data in the Supabase dashboard.

---

## 4. What exists today (current state)

### 4.1 Stack
- TanStack Start 1.168 (React 19, TanStack Router, SSR via Nitro)
- Vite 8, TypeScript, Tailwind CSS v4, shadcn/ui primitives
- Supabase (Postgres, RLS, anon key from browser)
- Resend email via Lovable connector gateway
- Generated and hosted through Lovable. `AGENTS.md` forbids force-pushes and history rewrites on `main`.

### 4.2 Routes

| URL | File | Purpose |
|---|---|---|
| `/` | `src/routes/index.tsx` | Landing page. Sections: Hero, Pain, Solution, Demos, Pricing calculator, How it works, Waitlist form, Contact form, FAQ (11 items). |
| `/demo/checkout` | `src/routes/demo.checkout.tsx` | Customer pays a hard-coded merchant invoice. Choose currency, amount, method (bank / momo / card), name, email. Logs to `demo_transactions`, emails a receipt. |
| `/demo/send` | `src/routes/demo.send.tsx` | Cross-border supplier payment. Choose from/to currency, amount, payout method. Animates five stages (verify, compliance, convert, payout, settled). Logs to `demo_transactions`, emails a confirmation. |
| `/demo/request` | `src/routes/demo.request.tsx` | Merchant creates a payment-request link. Writes a `payment_requests` row with an `MRD-XXXXXXXX` reference. Optionally emails the payer. Shows copy button and "open as payer" link. |
| `/pay/$reference` | `src/routes/pay.$reference.tsx` | Payer opens the request. States: loading, not found, already paid, pending. Pending shows fee breakdown and a Pay button. Pay sets `status = paid`, logs to `demo_transactions`, emails a receipt. |
| `/terms` | `src/routes/terms.tsx` | Terms of Service. Kenyan law. States product is under development and is a technology platform only. |
| `/privacy` | `src/routes/privacy.tsx` | Privacy Policy. Lists data collected. |

### 4.3 Pricing engine (`src/lib/fees.ts`)
This is the most concrete spec of product behaviour in the repo.

| Item | Value |
|---|---|
| Partner fee, bank transfer | 1.0% |
| Partner fee, mobile money | 2.0% |
| Partner fee, card | 2.5% |
| Meridian fee | flat 1.0% |
| FX spread | mid-market + 0.35% (only when currencies differ) |
| Supported currencies | NGN, KES, GHS, ZAR, UGX, TZS, USD |
| FX rates | hard-coded `perUsd` constants (NGN 1530, KES 129, GHS 15.2, ZAR 18.1, UGX 3760, TZS 2610) |
| Collection quote | `net = amount − partnerFee − meridianFee`. Compared against a 3.8% "traditional" rate. |
| Cross-border quote | `partnerFee = avg(bank, payoutMethod)`, plus Meridian fee, plus FX fee if currencies differ. Recipient gets `convert(net)`. Compared against a 9% "traditional" rate. |
| Reference format | `MRD-` + 8 chars from an unambiguous alphabet |

### 4.4 Data model (Supabase, one migration)

| Table | Purpose | Browser access (anon) |
|---|---|---|
| `waitlist_signups` | business_name, contact_name, email, country, monthly_volume, pain_point | INSERT only |
| `contact_messages` | name, email, company, subject, message | INSERT only |
| `payment_requests` | reference (unique), from_business, to_business, to_email, amount, currency, memo, status (`pending` / `paid`), paid_at | SELECT, INSERT, UPDATE on all rows |
| `demo_transactions` | kind (`checkout` / `cross_border` / `payment_request`), reference, payer_name, payer_email, merchant, send_currency, receive_currency, amount, partner_fee, meridian_fee, total_fee, recipient_gets | INSERT only |

No enums, views, functions, triggers or edge functions. No auth tables in use.

### 4.5 Email (`src/lib/notify.functions.ts`)
- One TanStack server function, `sendNotification`. Zod-validated payload.
- Renders a branded HTML email and POSTs to Resend through `connector-gateway.lovable.dev`.
- Needs `LOVABLE_API_KEY` and `RESEND_API_KEY`. If missing it returns `{ sent: false }` silently.
- Sends from `Meridian Demo <onboarding@resend.dev>` (Resend sandbox sender).
- Every caller swallows errors. Users never see email failures.

### 4.6 Auth
None. No login, signup, sessions, roles or protected routes. Lovable's auth scaffolding (`auth-middleware.ts`, `client.server.ts`, `cron-auth.ts`) is present but unused.

### 4.7 Environment
`.env` is git-ignored. To run locally, create `meridian/.env` with:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable key>
# Optional. Without these, forms save but no email is sent.
LOVABLE_API_KEY=
RESEND_API_KEY=
```

---

## 5. Product vision (what the site promises)

The landing page describes a full product. None of this is built. Listed here so gaps are explicit.

### 5.1 Core promise
- Send and receive money locally and across African borders in minutes.
- Save up to 80% versus traditional transfer cost.
- Flat 1% Meridian fee on top of disclosed partner cost. Every line shown before confirm.
- Local currency in, local currency out. User never sees crypto.
- "Works like the mobile money you already know, only faster, cheaper and borderless."

### 5.2 How it works (3 steps, from the site)
1. **Sign up with business details.** One-time KYB verification for AML compliance.
2. **Fund account in local currency.** Bank transfer or mobile money. Balance shows in NGN, GHS, KES, USD, etc.
3. **Send or request payment.** Recipient gets local currency in bank or mobile money account. Meridian handles conversion, compliance and settlement.

### 5.3 Launch markets
Nigeria, Kenya, Ghana, South Africa, Uganda, Tanzania. USD for international counterparties. Waitlist responses decide build order.

### 5.4 Regulatory stance
- Meridian is strictly a technology platform. It does not hold, control or handle client funds.
- Licensed infrastructure partners handle collections, FX, custody and payouts.
- KYB is mandatory for every business account.
- Partner names shared on request only.

### 5.5 Waitlist promises
- Founding-user pricing locked for first 12 months.
- Early access in the user's corridor before public launch.
- Direct line to the team.
- One email on launch day. No spam.

---

## 6. Functional requirements

Requirement IDs use `M-` prefix. Status: **Done**, **Partial**, **Not started**.

### 6.1 Marketing site and lead capture

| ID | Requirement | Status |
|---|---|---|
| M-01 | Landing page with problem, solution, pricing, how-it-works, FAQ | Done |
| M-02 | Live pricing calculator (from currency, amount, to currency) | Done |
| M-03 | Waitlist form saves to `waitlist_signups` and emails confirmation | Done (email depends on keys) |
| M-04 | Contact form saves to `contact_messages` and emails confirmation | Done (email depends on keys) |
| M-05 | Terms and Privacy pages | Done |
| M-06 | Internal notification to Appify team on new waitlist / contact entry | Not started |
| M-07 | Admin view to read waitlist and contact submissions | Not started |
| M-08 | Spam protection (rate limit or captcha) on public forms | Not started |
| M-09 | Verified sending domain for email (replace `onboarding@resend.dev`) | Not started |
| M-10 | Surface email failure to user or log it server-side | Not started |

### 6.2 Demos

| ID | Requirement | Status |
|---|---|---|
| M-20 | Checkout demo (bank / momo / card) with fee breakdown and receipt email | Done |
| M-21 | Cross-border send demo with animated settlement stages | Done |
| M-22 | Payment request link demo: create, share, pay, settle | Done |
| M-23 | Demo transactions logged to `demo_transactions` | Done |
| M-24 | Check insert errors in checkout and send demos (currently ignored) | Not started |
| M-25 | Reuse shared `DemoHeader` in send, request and pay routes (currently duplicated) | Not started |
| M-26 | Lock down `payment_requests` so anon cannot list or update arbitrary rows | Not started |

### 6.3 Real product: onboarding and accounts

| ID | Requirement | Status |
|---|---|---|
| M-40 | Business sign-up and login (Supabase Auth) | Not started |
| M-41 | KYB flow: business docs, director IDs, status tracking | Not started |
| M-42 | Team members and roles within a business account | Not started |
| M-43 | Protected dashboard routes | Not started |

### 6.4 Real product: money movement

| ID | Requirement | Status |
|---|---|---|
| M-50 | Multi-currency balances per business | Not started |
| M-51 | Fund account via bank transfer or mobile money (partner integration) | Not started |
| M-52 | Send to recipient bank or mobile money in another market | Not started |
| M-53 | Live FX rates from partner (replace hard-coded `perUsd`) | Not started |
| M-54 | Real fee schedule per market and method (replace indicative constants) | Not started |
| M-55 | Create and share payment request links tied to a real account | Not started |
| M-56 | Hosted checkout for merchants | Not started |
| M-57 | Transaction history, receipts, exports | Not started |
| M-58 | Compliance checks and limits per transaction | Not started |
| M-59 | Webhooks / status updates from partners | Not started |

---

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | No service-role key in the browser. RLS on every table. Anon may never read or update rows it did not create. |
| Compliance | KYB before any real money movement. Audit log of every transaction and status change. |
| Availability | Landing site must stay up independently of partner APIs. |
| Performance | Landing page loads under 2s on 3G. Demos respond under 500ms for quotes. |
| Observability | Server errors and email failures logged. Currently errors are swallowed. |
| Data | `.env` never committed. Secrets injected at deploy time by Lovable Cloud or host. |
| History | No force-push or rebase on `main` (Lovable sync). |

---

## 8. Known gaps and technical debt

Ordered roughly by risk.

1. **Open write and update access on `payment_requests`.** Any visitor can list every request or mark any one as paid. Fine for a demo, unsafe for anything real.
2. **Email failures are invisible.** Server function no-ops when keys are missing. Callers `.catch(() => undefined)`.
3. **Sandbox sender.** `onboarding@resend.dev` cannot send to arbitrary inboxes in production.
4. **No spam protection** on waitlist and contact inserts.
5. **No internal notification.** Team only learns about a signup by opening Supabase.
6. **Hard-coded FX rates and fees.** `fees.ts` constants will drift from reality.
7. **Insert errors ignored** in `demo.send.tsx` and `demo.checkout.tsx`.
8. **Duplicated `DemoHeader` markup** across three routes.
9. **Dead code.** `client.server.ts`, `auth-middleware.ts`, `cron-auth.ts` never imported. 44 of 46 shadcn components unused.
10. **Template leftovers.** `package.json` name is `tanstack_start_ts`. `README.md` is the Lovable default.
11. **Hard-coded dates.** Terms and Privacy effective date is "14 September 2026".
12. **No tests.** No unit tests for `fees.ts`, no e2e for the demos.

---

## 9. Open questions for the owner

Answers here decide what the next work item is.

1. **Next milestone.** Is the goal to harden the marketing site and collect leads, or to start the real product (auth, KYB, balances)?
2. **Infrastructure partners.** Which providers are candidates for collections, FX and payouts? This shapes the data model for M-50 onward.
3. **First corridor.** Which single corridor launches first (e.g. NGN → KES)? Or wait for waitlist data?
4. **Admin.** Should the team read leads from a small admin page, from Supabase directly, or from an email/Slack notification?
5. **Email.** Do you own a domain to verify with Resend? Which address should send?
6. **Demos.** Keep them public and open, or gate behind the waitlist email?
7. **Pricing.** Are the 1% / 2% / 2.5% / 0.35% figures real partner quotes or placeholders?
8. **Hosting.** Stay on Lovable Cloud, or move to Vercel / Cloudflare / own infra?
9. **Testing.** Add a test runner (Vitest) now, before the real product starts?

---

## 10. Suggested next steps (for discussion, not committed)

**Option A: Harden the launch site (1 to 2 days)**
- M-06, M-08, M-09, M-10, M-24, M-25, M-26.
- Clean template leftovers. Add Vitest and tests for `fees.ts`.

**Option B: Start the real product (multi-week)**
- Write a TRD for auth, KYB, balances and partner integration.
- Pick one corridor. Build M-40 to M-43, then M-50 to M-53 for that corridor.
- Keep demos as a sandbox mode of the real app.

**Option C: Both, in that order.**
