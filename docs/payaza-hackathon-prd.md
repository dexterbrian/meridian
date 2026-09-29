# Meridian Collect — Payaza Hackathon PRD

| Field | Value |
|---|---|
| Product | Meridian Collect (the collection half of Meridian) |
| Owner | Appify Softwares Limited, Nairobi, Kenya ([appify.co.ke](https://appify.co.ke)) |
| Repo | https://github.com/dexterbrian/meridian |
| Event | Payaza Borderless Kenya Hackathon ([hackathon.payaza.africa](https://hackathon.payaza.africa/)) |
| Track | 3. SME and exporter collections |
| Status | Shortlisted. Build day 28 September 2026: the collection flow runs end to end against Payaza's sandbox. Demo day 29 September. |
| Deployment | Vercel at **https://meridian.appify.co.ke**. Built and tested locally first, with an ngrok tunnel for Payaza's webhooks. |
| Document version | 0.2 |
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
| Meridian fee | Flat 1% of what the payer pays. It is what stays in Meridian's Payaza balance after the business is paid its full amount by Transfers. (Split settlement is bank-only and NGN-only in Payaza's docs today, so it is not used. See TRD 4.2.) |
| Whole-unit rails | M-Pesa and most East African wallets move whole units. For KES, UGX, TZS, XOF, XAF and CDF the payer total is rounded up to a whole unit; the extra goes to the partner fee line and the business still gets the exact amount. Example: KES 650,000 by mobile money costs the payer KES 670,104, not 670,103.09. |
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
| **Payout reference** | Meridian, one per payout | `MRDP-VNN6FG3X-1` | Sent to Payaza Transfers. Carries the attempt number so a multi-use link's payouts stay unique. |

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
5. Meridian pays the business's saved account, in its payout currency, through Payaza Transfers. The business gets the full requested amount. Meridian's 1% is what stays behind in the Payaza balance.
6. Both sides get a receipt with the invoice number and the Meridian reference.

Meridian never holds a balance for the business.

**Sandbox limits found on build day.** Payaza's test merchant has no payout float, so Transfers cannot succeed in the sandbox. With `PAYAZA_SIMULATE_PAYOUTS=true` (sandbox only) the payout is marked settled without calling Payaza and the timeline says "Paying out (simulated)". The account name enquiry returns one canned name for any input in the sandbox, so the name match is shown as a warning there and enforced only in live mode. Both are listed as asks to Payaza in section 9.

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

IDs use the `H-` prefix. Priority: **Must** (in the demo), **Should** (if time allows). Status as of the end of build day, 28 September 2026. **Done** means it works against Payaza's sandbox. **Sandbox-blocked** means the code is written but Payaza's test account cannot run it yet.

### 6.1 Business

| ID | Requirement | Priority | Status |
|---|---|---|---|
| H-01 | Sign in with email code | Must | Done |
| H-02 | Business profile: name, country, contact | Must | Done (`/app/onboarding`) |
| H-03 | Payout account in the business's chosen currency (KES, UGX, TZS, NGN, GHS, ZAR, ZMW, XAF, LRD, CDF), mobile money or bank, name checked with Payaza account name enquiry. Several accounts per currency allowed (e.g. M-Pesa and bank, both KES); one is the default and receives that currency's payouts. Accounts can be edited; the currency is fixed once created. | Must | Done. Name match enforced in live mode; the sandbox returns a canned name, so there it is shown as a warning. |
| H-04 | Create a payment request: amount, currency, **invoice number**, note, single or multi use | Must | Done, plus optional expiry and payer email |
| H-09 | Edit a payment request while it is active. Invoice number, note, payer email and expiry can always change. Amount, currency and usage lock once a payer has started paying. | Must | Done |
| H-05 | Share the link by copy, email or WhatsApp | Must | Done |
| H-06 | Dashboard: requests, status, invoice number, reference, who paid, payout status | Must | Done, with a per-attempt timeline on the request page |
| H-07 | Search the dashboard by invoice number or Meridian reference | Should | Done |
| H-08 | CSV export of payments | Should | Done |

### 6.2 Payer

| ID | Requirement | Priority | Status |
|---|---|---|---|
| H-10 | Pay page shows the business, amount, invoice number, reference and note | Must | Done |
| H-11 | Pick a method: mobile money, bank transfer, card. Each shows what it needs. | Must | Done. Methods are filtered by the request currency. |
| H-12 | Fee summary under the amount, with fees at 0 until a method is picked | Must | Done |
| H-13 | "See breakdown" opens the full breakdown beside the form. On phones it scrolls down to it. | Must | Done |
| H-14 | The payer pays fees on top. The business gets the exact amount. | Must | Done, including whole-unit rounding for M-Pesa (5.3) |
| H-15 | Show the payer's amount in their own currency before they pay | Won't do | Payaza does not convert currencies (section 9, question 5, answered 29 Sep), so the payer always pays in the request currency. Requests are limited to the currencies the business holds payout accounts in, so every request can be paid out. |
| H-16 | Receipt email to the payer with invoice number and reference | Must | Done (needs `RESEND_API_KEY` to deliver) |

### 6.3 Payaza integration

| ID | Requirement | Priority | Status |
|---|---|---|---|
| H-20 | Payaza sandbox and live keys, server side only, one switch between them | Must | Done. `MERIDIAN_MODE` picks `X-TenantID`; the secret key never leaves the server. |
| H-21 | Mobile money collection (KES, UGX, TZS, GHS, SLE, XOF) | Must | Done for KES (M-Pesa, `SAFKEN`), proven in the sandbox. Other currencies are wired but the test account returned "Service Unavailable" for GHS; ask Payaza to enable them. |
| H-22 | NGN virtual account collection | Must | Done (dynamic account, 30 minutes, amount validation) |
| H-23 | Card collection in USD and NGN, 3DS | Must | Done through Payaza Web Checkout; not yet exercised with a test card |
| H-24 | Payaza payment links with the customer bearing fees | Should | Not started |
| H-25 | Apple Pay and Google Pay | Should | Comes with Web Checkout; not exercised |
| H-26 | Webhook handler: verify the HMAC SHA512 signature, match the reference, ignore repeats | Must | Done (`/api/webhooks/payaza`) |
| H-27 | Status query as a fallback when a webhook is late | Must | Done. The pay page's poll asks Payaza after 15 seconds; the retry job asks after 2 minutes. |
| H-28 | Split settlement: Meridian's 1% to Meridian | Dropped | Not used, by decision. Meridian is the Payaza merchant, so its 1% never leaves its own Payaza balance; splitting it to itself adds nothing. Split also can't convert currencies (Payaza, 29 Sep). Transfers pays the business; the 1% stays in the balance of the currency it was collected in. |
| H-29 | Payout to the business through Payaza Transfers, in the payout account's currency, after the payment is confirmed | Must | Sandbox-blocked. Code complete; the test merchant has no payout float, so `PAYAZA_SIMULATE_PAYOUTS` stands in and the timeline says so. |

### 6.4 Idempotency and references

| ID | Requirement | Priority | Status |
|---|---|---|---|
| H-30 | Meridian reference per request (`MRD-` plus 8 characters) | Must | Done |
| H-31 | Business invoice number stored, shown and searchable | Must | Done |
| H-32 | Idempotency key on "Create request". The same key returns the same request. | Must | Done |
| H-33 | One Payaza reference per payment attempt, saved before the call. A paid request can't be paid again. | Must | Done (`start_collection_attempt`, proven by `npm run e2e:sandbox`) |
| H-34 | Webhooks processed once per reference and status | Must | Done (unique key on `transaction_events`) |
| H-35 | One payout per payment, enforced by the database. Retries check status first. | Must | Done (unique `payout_reference`, claimed with a conditional update) |

### 6.5 Quality

| ID | Requirement | Priority | Status |
|---|---|---|---|
| H-50 | Unit tests (Vitest) for fee maths: gross-up exact to the cent, zero fees before a method is picked | Must | Done, plus whole-unit currencies |
| H-51 | Unit tests for reference formats: request, attempt (15 characters max), payout | Must | Done |
| H-52 | Unit tests for the Payaza webhook signature check: valid, tampered, wrong secret | Must | Done |
| H-53 | Unit tests for idempotency: same webhook twice changes state once; one payout per payment | Must | Done as an end-to-end script against the sandbox (`npm run e2e:sandbox`); the rules live in the database, so a pure unit test would prove little |
| H-54 | Unit tests for the checks in 5.7 and for currency rules (payout currency supported, one default account per currency) | Must | Done for 5.7; the currency rules are schema constraints |
| H-55 | Lint, type check and tests run on every push; a failure blocks the merge | Must | Done (`.github/workflows/ci.yml`); branch protection to be switched on in GitHub |

### 6.6 Admin

| ID | Requirement | Priority | Status |
|---|---|---|---|
| H-40 | List of payments and payouts with status | Must | Done, with a per-transaction page showing events, flags and every Payaza call |
| H-41 | Flags from 5.7, with release or reject | Must | Done |
| H-42 | Failed payout: alert, retry, or mark for a manual refund | Must | Done |

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

1. Ann signs in. She creates a request for KES 650,000 with her invoice number `AF-0917` and sends the link on WhatsApp. The currency list offers only KES, because her payout account is in KES and Payaza pays out only in the currency the payer pays in.
2. Her buyer opens it. Fees show 0 until they pick mobile money. Then the fees and the payer total (KES 670,104) appear, with the breakdown.
3. The buyer pays with M-Pesa in Payaza's sandbox. The "Simulate approval on the phone" button plays the buyer entering their PIN. (A buyer paying in cedis would need Ann to hold a GHS payout account: Payaza does not convert currencies.)
4. Payaza's webhook arrives. The timeline moves to "Paid", then "Paying out", then "Settled". (Payout simulated unless Payaza funds the test float.)
5. Ann's dashboard shows KES 650,000 received against `AF-0917`, and the request page shows the attempt's timeline. Both sides have receipts.
6. We replay the same webhook with curl. The response says `duplicate` and nothing changes. That shows idempotency. Then we click Pay on the same link again: the database refuses because the request is paid.
7. Show the admin page with a held payment released.
8. Close honestly on what Payaza can't do yet. Chris's European buyers and AfricaHackon's South Sudanese customers would pay by card in USD, but Payaza has no USD payouts and no currency conversion, so those payments can't reach a Kenyan business today. Those two features are our ask to Payaza.

---

## 9. Decisions and open questions

**Decided**
- Collection only for the hackathon. Supplier payouts after. (26 Sep)
- The payer covers fees, grossed up so the business gets the exact amount. (27 Sep)
- Businesses keep their own invoice numbers. Meridian adds its `MRD-` reference. Meridian does not make invoices. (28 Sep)
- Idempotent at every money step (5.5). (28 Sep)

- Deploy to Vercel at `meridian.appify.co.ke`. Develop locally with an ngrok tunnel for webhooks. (28 Sep)
- Transfers, not split settlement, pays the business. Meridian's 1% is what remains in the Payaza balance. (28 Sep, build day)
- Whole-unit currencies charge the payer a whole unit; the business still gets the exact amount. (28 Sep, build day)
- Payaza's public key is used for API calls and Web Checkout; the secret key only signs webhooks. (28 Sep, confirmed against the sandbox)

**Questions for Payaza**

The account is `PZ78` in test mode. Written so they can be copied straight into an email to [integrationsupport@payaza.africa](mailto:integrationsupport@payaza.africa).

_Blocks the live demo — please answer first:_

1. **Fund our test payout balance.** Our test merchant has no balance to pay out from, so the Transfers API returns "An error occurred while processing transaction". Please credit our sandbox KES balance (and NGN if easy) so we can run a real payout to an M-Pesa number. What is the test top-up process?

2. **Enable mobile money collections beyond Kenya.** KES collections work on our test key. GHS returns `response_code 96, "Service Unavailable"`. Your docs say non-Nigeria collections are enabled on request. Please enable **GHS (Ghana), UGX (Uganda) and TZS (Tanzania)** mobile money collections for our test account, and the same currencies in live.

3. **Mobile money network (bank) codes.** We have confirmed `SAFKEN` (M-Pesa Kenya), `MTNCMR`, `ORACMR`, `MOMCIV`, `WAVCIV`, `AFRSLE`, `EFTZAR`, `CPZZAR` from your docs and the sandbox. Please confirm the `customer_bank_code` for the other networks we plan to accept: **Airtel Kenya, MTN / Vodafone / AirtelTigo Ghana, MTN / Airtel Uganda, Vodacom (M-Pesa) / Airtel / Tigo / HaloPesa Tanzania.** The full sheet you link is currency-summary only.

4. **Bank Codes API returns 403.** `GET /payaza-account/api/v1/mainaccounts/merchant/banks/{currency}` returns `Authentication failed (403)` with our test public key, though the same key authenticates collections and account enquiry. Does this endpoint need a different scope or activation on our account?

_Affects the product but not the live demo:_

5. ~~**Cross-currency payout.**~~ **Answered by Payaza, 29 September 2026: no.** Payaza does not convert a payment received in one currency (GHS, USD …) into another (KES …) for payouts or transfers, and split settlement does not convert either. A payment can only pay out in the currency it was collected in.

6. **Card limits for large B2B payments.** One of our exporters collects USD 35,000–40,000 per shipment by card. What is the per-transaction and daily card limit, and is 3DS required at that size?

7. **Payaza's fee before the charge.** We only see `transaction_fee` on the webhook and status query (it is 0 in the sandbox). Is there any way to get the fee for a method and amount *before* charging, so we can show it to the payer exactly rather than from our own schedule?

8. **Webhook behaviour.** How many times do you retry a webhook, over what period? And what happens if we reuse a `transaction_reference` — is the second call rejected, and with what response?

9. **Account name enquiry in the sandbox.** In test mode the enquiry returns the same name (`Chibunkem Ojiaku`) for any account number, so we cannot really verify a payout account there. Is there a way to get real test names, or does this only work in live?

10. **Collecting on behalf of other businesses.** Meridian is the merchant; the money belongs to the businesses we onboard, and we pay it straight out to them. Is this allowed under your terms, and are there limits? Your sub-accounts are documented as internal only.

_Corridor coverage (for the roadmap, not the demo):_

11. Does **Rwanda (RWF)** mobile money collection work? RWF is in your currency list but not your mobile money list.
12. Is **South Sudan (SSP)** collection on your roadmap? A customer there can pay us by USD card today, but not by local mobile money.
13. ~~Does **split settlement** support KES, and does it work across currencies?~~ **Answered by Payaza, 29 September 2026:** split settlement does not convert between currencies; a USD payment can't be split and settled in KES. Transfers stays the payout path.

_Answered:_
- Hackathon dates: build 28/09/2026, demo 29/09/2026, submit the web app link.
- Keys: the public key authenticates the API and is the Web Checkout `merchant_key`; the secret key signs webhooks (base64 HMAC SHA512). Confirmed against the sandbox.

---

## 10. Next steps

1. ~~Watch for the shortlist email.~~ Shortlisted.
2. ~~Open a Payaza sandbox account.~~ Done. Send Payaza questions 1 to 4 today; they decide how much of the demo is live.
3. ~~Add the invoice number field.~~ Done.
4. ~~Build H-20 to H-29 and H-32 to H-35 against the sandbox.~~ Done on build day; see section 6 for what the sandbox blocks.
5. Owner review of the local build, then deploy to Vercel at `meridian.appify.co.ke`: set the environment variables, point the Payaza webhook URLs at `/api/webhooks/payaza`, run the migration on the hosted Supabase project, mark Brian as admin.
6. Run the demo script (section 8) end to end on the deployed app with `MERIDIAN_MODE=sandbox`.
7. Ask AfricaHackon how their South Sudanese customers pay today.
