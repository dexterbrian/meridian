# Meridian Collect — Payaza Hackathon PRD

| Field | Value |
|---|---|
| Product | Meridian Collect (the collection half of Meridian) |
| Owner | Appify Softwares Limited, Nairobi, Kenya ([appify.co.ke](https://appify.co.ke)) |
| Repo | https://github.com/dexterbrian/meridian |
| Event | Payaza Borderless Kenya Hackathon ([hackathon.payaza.africa](https://hackathon.payaza.africa/)) |
| Track | 3. SME and exporter collections |
| Status | Idea submitted 26 September 2026. Awaiting shortlist. Demo flows exist in the repo, simulated. |
| Document version | 0.1 |
| Date | 28 September 2026 |
| Related | [Main PRD](./prd.md) · [Customer interviews](./customer-interviews.md) · [Idea deck](./meridian-payaza-collect-deck.pptx) · [Payaza docs](https://docs.payaza.africa/) |

---

## 1. Summary

Meridian Collect lets a business get paid by a customer in another country. The business sends a payment link. The customer pays in their own currency, the way they already pay. The business receives the exact amount it asked for, the same day, in **its own currency**: a Kenyan business in KES, a Ugandan business in UGX. We start with Kenyan businesses because they are who we interviewed, but nothing is limited to Kenya.

Payaza moves the money. Meridian is the layer on top: payment requests, fee display, checks, tracking and receipts.

This document covers **only what the hackathon build needs**. The [main PRD](./prd.md) covers the full product.

### 1.1 The build in one paragraph

A Kenyan exporter signs in and creates a payment request. They enter the amount, the currency, their own invoice number and a note. Meridian gives it a reference like `MRD-VNN6FG3X` and a link. The buyer opens the link, sees every fee, and pays by mobile money, bank transfer or card through Payaza. The buyer pays the fees on top, so the exporter gets the full amount. Payaza confirms the payment by webhook. Meridian runs its checks and pays the exporter's mobile money or bank account, in the exporter's own currency, through Payaza. Both sides get a receipt that shows the invoice number and the Meridian reference.

### 1.2 Why collection only

Meridian's full plan covers collecting **and** paying suppliers. The hackathon track is about collections. Building payouts to suppliers now would stretch the scope past the track and risk disqualification. Paying suppliers is built after the hackathon, from the [main PRD](./prd.md).

Paying the exporter their own money is part of collection. That payout stays in scope.

---

## 2. Problem

The track brief says small exporters "struggle to collect from international buyers without expensive intermediaries". Our interviews say the same.

| Business | What happens today | What it costs them |
|---|---|---|
| **Chris**, avocado exporter | Buyers in Europe, Egypt and the Gulf pay USD 35,000 to 40,000 per weekly shipment by SWIFT. It takes 2 to 3 days from Europe. Gulf banks close on Fridays. Buyers delay until they like the exchange rate. | Cold storage bills. Farmers wait for pay at harvest. Missed sailings. |
| **Ann**, flower exporter | Buyers in Ghana, Nigeria, Namibia and Côte d'Ivoire pay by bank transfer. It takes 1 to 3 working days to clear. | She loses money on the exchange rate between invoice and payment. Flowers are perishable, so cash is tied up while stock ships. |
| **AfricaHackon**, cybersecurity events and courses (from Bright) | A client in South Sudan had to travel to Nairobi to pay for a course in person. People in Sierra Leone and Nigeria ask how to send money to Kenya. | Lost sign-ups. Customers carry cash across borders. |

Two things matter more than fees: **speed** and **getting the exact amount invoiced**.

---

## 3. Users

| User | Who | What they do |
|---|---|---|
| **Business** (primary) | An SME that sells abroad. Kenya first (Chris, Ann, AfricaHackon), then Uganda, Tanzania, Rwanda and other markets Payaza pays out to. | Signs in, adds a payout account, creates payment requests, shares links, tracks payments, reads receipts. |
| **Payer** (secondary) | The business's customer, in another country. No account. | Opens the link, picks a method, pays, gets a receipt. |
| **Admin** (internal) | Brian. | Watches payments, clears held ones, handles failed payouts. |

---

## 4. How the build meets the judging criteria

Each criterion carries equal weight.

| Criterion | How Meridian Collect meets it |
|---|---|
| **Problem fit** | Built from three real Kenyan businesses with named pains: slow clearing, exchange-rate loss, customers who can't pay. |
| **Payaza infrastructure use** | Payaza runs every money step: payment links and checkout, mobile money, virtual accounts, cards, split settlement, transfers, account name checks, webhooks and status checks. See 5.2. |
| **Feasibility** | Three businesses ready to pilot. One Payaza integration. No wallet or stored balance, so no e-money licence needed to start. |
| **User experience** | The payer uses the method they already have. Every fee shows before they pay. The business sees one timeline per payment. |
| **Presentation** | A short live demo of one real-looking order, end to end. See section 8. |

---

## 5. Product definition

### 5.1 Core promise

- The business gets the **exact amount** it asked for, in the currency it chose.
- The payer pays in their own currency, the way they already pay.
- Every fee is shown before the payer pays. The payer covers the fees.
- Money reaches the business the same day where Payaza's rails allow.
- One reference follows the payment from link to receipt.

### 5.2 What Payaza covers

Checked against Payaza's docs on 28 September 2026.

**Collecting from the payer**

| Payer is in | Pays with | Payaza product |
|---|---|---|
| Kenya, Uganda, Tanzania, Ghana, Sierra Leone, Liberia, Zambia, Cameroon, DR Congo | Mobile money in KES, UGX, TZS, GHS, SLE, LRD, ZMW, XAF, CDF | Mobile money collection |
| Côte d'Ivoire, Benin | Mobile money in XOF (Orange Money, with an OTP) | XOF collection |
| South Africa | EFT in ZAR | ZAR collection |
| Nigeria | Bank transfer to a one-off account in NGN, or card in NGN | Virtual accounts (dynamic), card collection |
| Anywhere else (Europe, the Gulf, the US, Namibia, South Sudan) | Visa or Mastercard in USD. Apple Pay or Google Pay. | Card collection (NGN and USD only), Apple Pay and Google Pay |
| Any of the above | Payaza's hosted page | Payment links, Web Checkout |

**Paying the business**

| Step | Payaza product |
|---|---|
| Check the business's account name before saving it | Account name enquiry |
| Pay the business in its own currency, to mobile money or a bank account | Transfers (KES, UGX, TZS, NGN, GHS, ZAR, ZMW, XAF, LRD, CDF) |
| Take Meridian's 1% out of each payment automatically | Split settlement |
| Confirm every payment and payout | Webhooks (signed with HMAC SHA512) and transaction status queries |

**What Payaza does not cover (as of the docs today)**

- **EUR.** Cards collect in NGN and USD only. Chris's European buyers would pay in USD by card.
- **South Sudanese pounds.** No SSP mobile money. See 5.9.
- **Rwanda.** RWF appears in Payaza's currency list but not in its mobile money list. Confirm before promising the Kenya-Rwanda corridor.
- **Large card payments.** Chris's buyers pay USD 35,000 or more per shipment. Card limits at that size need confirming with Payaza.

### 5.3 Pricing

| Item | Rule |
|---|---|
| Who pays fees | **The payer.** Fees are added on top so the business gets the full amount. |
| How the total is worked out | Fees are charged on what the payer pays, not on the invoice. So the payer total = amount ÷ (1 − fee rate). Example: a USD 36,000 request paid by card (2.5% partner + 1% Meridian) costs the payer USD 37,305.70, and the business gets USD 36,000.00. |
| Meridian fee | Flat 1%. Taken by Payaza split settlement. |
| Partner fee | Payaza's fee for the method. Shown as its own line. |
| Before a method is picked | Fees show as 0. The payer total shows the amount. Fees appear once a method is chosen. |
| Exchange rate | Meridian adds nothing. The payer sees Payaza's rate before paying. |

Payaza payment links support a fee setting that makes the customer bear the processing fee. We use it.

### 5.4 Invoice numbers and references

Businesses already make their own invoices. Meridian does not make invoices for them.

| Reference | Who sets it | Example | Where it shows |
|---|---|---|---|
| **Invoice number** | The business, optional, free text | `INV-2048` | Pay page, receipts to both sides, business dashboard, CSV export. Searchable. |
| **Meridian reference** | Meridian, one per payment request | `MRD-VNN6FG3X` | The link, pay page, receipts, dashboard, support. |
| **Payaza transaction reference** | Meridian, one per payment attempt | `MRD-VNN6FG3X-1` | Sent to Payaza. Used to match webhooks and status checks. |
| **Payout reference** | Meridian, one per payout | `MRDP-VNN6FG3X` | Sent to Payaza Transfers. |

Payaza asks for a unique reference on every charge, at most 15 characters for cards, and at least 10 for transfers. The formats above fit both.

The business's invoice number is not unique. Two requests can share one, for example when an invoice is paid in parts. The Meridian reference is always unique.

### 5.5 Idempotency

"Idempotent" means doing the same thing twice has the same effect as doing it once. In money terms, **nobody is ever charged twice and nobody is ever paid twice**, even when a button is double-clicked, a network call is retried or Payaza sends the same webhook again.

| Where a repeat can happen | Rule |
|---|---|
| Business double-clicks "Create request" | The form sends an idempotency key. The same key returns the same request instead of making a second one. |
| Payer double-clicks "Pay", or the page retries | A request that is already paid can't start a new payment. Each attempt gets its own Payaza reference, saved **before** calling Payaza. A retry of the same attempt reuses that reference. |
| Payaza sends the same webhook more than once | Each webhook is matched on Payaza's transaction reference and status. A repeat is logged and ignored. One event, one change of state. |
| The payout call times out | Before retrying, ask Payaza for the payout's status with the same reference. Only retry if Payaza has no record of it. |
| Two payouts for one payment | Impossible by design. The database allows only one payout per collected payment. |

Payaza's own guidance says the same: "Process transactions based on their unique transaction_reference to avoid duplicate actions."

### 5.6 Money flow (no stored balance)

1. The business creates a payment request: amount, currency, invoice number, note, single or multi use.
2. The payer opens the link and picks a method. Meridian shows fees and the payer total.
3. Meridian saves the attempt and its reference, then starts the Payaza charge.
4. Payaza confirms by webhook. Meridian verifies the signature, checks the reference, records the payment and runs checks (5.7).
5. Payaza split settlement sends Meridian's 1% to Meridian's account.
6. Meridian pays the business's saved account, in its payout currency, through Payaza Transfers. The business gets the full requested amount.
7. Both sides get a receipt with the invoice number and the Meridian reference.

Meridian never holds a balance for the business.

### 5.7 Checks for the build

A light version of the main PRD's compliance rules, enough for a pilot with known businesses.

| Check | Action |
|---|---|
| Business is on the pilot list and signed in | Required to create requests. |
| Payout account name matches the business (Payaza account name enquiry) | Required to save the account. |
| Payment of USD 10,000 or more | Flag for Brian. Payout still goes ahead. |
| Payer country on the FATF blacklist | Block the payment. |
| Payment doesn't match an open request, or the amount is wrong | Hold the payout. Flag for Brian. |

Full KYB tiers and sanctions screening come from the main PRD after the hackathon.

### 5.8 Multi-use links

A multi-use link is a standing "pay us" page. AfricaHackon can publish one per course or event at a fixed price. Each payment against it gets its own attempt reference and receipt.

### 5.9 Can AfricaHackon collect from South Sudan through Payaza?

**Partly.**

- **Yes, by card in US dollars.** A South Sudanese customer with a Visa or Mastercard that works abroad can pay in USD. That removes the trip to Nairobi.
- **No, by mobile money or local bank.** Payaza has no South Sudanese pound collection. Customers with only m-Gurush or local mobile money can't pay through Payaza today.
- **Yes for the other markets Bright named.** Sierra Leone by mobile money (SLE). Nigeria by bank transfer to a one-off account, or by card, in NGN.

Next step: ask Payaza whether South Sudan is on their roadmap. Ask AfricaHackon how their South Sudanese customers usually pay.

### 5.10 Out of scope for the hackathon

Paying suppliers abroad (the "Send" flow). Kotani Pay and Klasha. Wallets and balances. Generating invoices. Full KYB tiers and sanctions screening. Embeddable script checkout (Payaza Web Checkout covers the hackathon). Recurring billing. Mobile app. Team members.

---

## 6. Functional requirements

IDs use the `H-` prefix. Priority: **Must** (in the demo), **Should** (if time allows). Status: **Done** means it works today as a simulation. Every Payaza item is **Not started**.

### 6.1 Business

| ID | Requirement | Priority | Status |
|---|---|---|---|
| H-01 | Sign in with email code | Must | Done |
| H-02 | Business profile: name, country, contact | Must | Not started |
| H-03 | Payout account in the business's chosen currency (KES, UGX, TZS, NGN, GHS, ZAR, ZMW, XAF, LRD, CDF), mobile money or bank, name checked with Payaza account name enquiry. One account per currency. | Must | Not started |
| H-04 | Create a payment request: amount, currency, **invoice number**, note, single or multi use | Must | Done as a demo (no invoice number field yet) |
| H-05 | Share the link by copy, email or WhatsApp | Must | Done as a demo (copy and email) |
| H-06 | Dashboard: requests, status, invoice number, reference, who paid, payout status | Must | Not started |
| H-07 | Search the dashboard by invoice number or Meridian reference | Should | Not started |
| H-08 | CSV export of payments | Should | Not started |

### 6.2 Payer

| ID | Requirement | Priority | Status |
|---|---|---|---|
| H-10 | Pay page shows the business, amount, invoice number, reference and note | Must | Done as a demo (no invoice number yet) |
| H-11 | Pick a method: mobile money, bank transfer, card. Each shows what it needs. | Must | Done as a demo |
| H-12 | Fee summary under the amount, with fees at 0 until a method is picked | Must | Done |
| H-13 | "See breakdown" opens the full breakdown beside the form. On phones it scrolls down to it. | Must | Done |
| H-14 | The payer pays fees on top. The business gets the exact amount. | Must | Done (fee maths) |
| H-15 | Show the payer's amount in their own currency before they pay | Must | Not started |
| H-16 | Receipt email to the payer with invoice number and reference | Must | Done as a demo |

### 6.3 Payaza integration

| ID | Requirement | Priority | Status |
|---|---|---|---|
| H-20 | Payaza sandbox and live keys, server side only, one switch between them | Must | Not started |
| H-21 | Mobile money collection (KES, UGX, TZS, GHS, SLE, XOF) | Must | Not started |
| H-22 | NGN virtual account collection | Must | Not started |
| H-23 | Card collection in USD and NGN, 3DS | Must | Not started |
| H-24 | Payaza payment links with the customer bearing fees | Should | Not started |
| H-25 | Apple Pay and Google Pay | Should | Not started |
| H-26 | Webhook handler: verify the HMAC SHA512 signature, match the reference, ignore repeats | Must | Not started |
| H-27 | Status query as a fallback when a webhook is late | Must | Not started |
| H-28 | Split settlement: Meridian's 1% to Meridian | Must | Not started |
| H-29 | Payout to the business through Payaza Transfers, in the payout account's currency, after the payment is confirmed | Must | Not started |

### 6.4 Idempotency and references

| ID | Requirement | Priority | Status |
|---|---|---|---|
| H-30 | Meridian reference per request (`MRD-` plus 8 characters) | Must | Done |
| H-31 | Business invoice number stored, shown and searchable | Must | Not started |
| H-32 | Idempotency key on "Create request". The same key returns the same request. | Must | Not started |
| H-33 | One Payaza reference per payment attempt, saved before the call. A paid request can't be paid again. | Must | Partly done (the demo won't mark a paid request as paid twice) |
| H-34 | Webhooks processed once per reference and status | Must | Not started |
| H-35 | One payout per payment, enforced by the database. Retries check status first. | Must | Not started |

### 6.5 Quality

| ID | Requirement | Priority | Status |
|---|---|---|---|
| H-50 | Unit tests (Vitest) for fee maths: gross-up exact to the cent, zero fees before a method is picked | Must | Done |
| H-51 | Unit tests for reference formats: request, attempt (15 characters max), payout | Must | Partly done (request format) |
| H-52 | Unit tests for the Payaza webhook signature check: valid, tampered, wrong secret | Must | Not started |
| H-53 | Unit tests for idempotency: same webhook twice changes state once; one payout per payment | Must | Not started |
| H-54 | Unit tests for the checks in 5.7 and for currency rules (payout currency supported, one account per currency) | Must | Not started |
| H-55 | Lint, type check and tests run on every push; a failure blocks the merge | Must | Not started |

### 6.6 Admin

| ID | Requirement | Priority | Status |
|---|---|---|---|
| H-40 | List of payments and payouts with status | Must | Not started |
| H-41 | Flags from 5.7, with release or reject | Must | Not started |
| H-42 | Failed payout: alert, retry, or mark for a manual refund | Must | Not started |

---

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | Payaza keys and the transfer PIN stay on the server. Webhook signatures are verified. Card numbers go straight to Payaza, never through Meridian. |
| Reliability | Idempotent throughout (5.5). Every Payaza call is logged with its request and response. |
| Accessibility | Every field has a name that screen readers read out. The pay page works on a small phone. |
| Performance | The pay page loads in under 2 seconds on 3G. |
| Records | Payments, webhooks and payouts are kept for 7 years. |

---

## 8. Demo script

One order, told end to end.

1. Ann signs in. She creates a request for KES 650,000 with her invoice number `AF-0917` and sends the link on WhatsApp.
2. Her buyer in Accra opens it. Fees show 0 until they pick mobile money. Then the fees and the total in cedis appear.
3. The buyer pays with MTN Mobile Money in Payaza's sandbox.
4. Payaza's webhook arrives. The timeline moves to "Paid", then "Paying out", then "Settled".
5. Ann's dashboard shows KES 650,000 received against `AF-0917`. Both sides have receipts.
6. We send the same webhook again live. Nothing changes. That shows idempotency.
7. Close with Chris (USD card from Europe) and AfricaHackon (USD card from South Sudan) on one slide.

---

## 9. Decisions and open questions

**Decided**
- Collection only for the hackathon. Supplier payouts after. (26 Sep)
- The payer covers fees, grossed up so the business gets the exact amount. (27 Sep)
- Businesses keep their own invoice numbers. Meridian adds its `MRD-` reference. Meridian does not make invoices. (28 Sep)
- Idempotent at every money step (5.5). (28 Sep)

**Open (ask Payaza)**
1. Can a payment collected in one currency (GHS, XOF, NGN, USD) be paid out in another (KES, UGX, TZS)? Who converts, and at what rate?
2. Card limits for single B2B payments of USD 35,000 or more.
3. Does Rwanda (RWF) mobile money collection work?
4. Is South Sudan (SSP) on the roadmap?
5. Does split settlement work across currencies?
6. How often do webhooks retry, and what happens when a reference is reused?
7. Hackathon dates for the build, the demo and what to submit. Not yet published. ANSWERED: build day 28/09/2026, demo day 29/09/2026. Submit the web app link.

---

## 10. Next steps

1. Watch for the shortlist email. ANSWER: We were shortlisted.
2. Open a Payaza sandbox account and send them the open questions.
3. Add the invoice number field to the payment request demo.
4. Build H-20 to H-29 against the sandbox, then the idempotency items H-32 to H-35.
5. Ask AfricaHackon how their South Sudanese customers pay today.
