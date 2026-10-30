# Routed providers: what has been tested, and what each one still needs

| Field | Value |
|---|---|
| Branch | `feat/multi-partner-routing` |
| Last tested | 30 October 2026 |
| How to re-run | `npm run partners:check` (asks each switched-on provider for a live price; nothing pays) |

Meridian asks every provider that can carry a payment for a price, uses the
cheapest and keeps the rest as backups. This file records what has actually been
run against each provider, as opposed to built from their documentation.

## Where things stand, 30 October 2026

One list decides which providers may carry money: `ENABLED_PROVIDERS` in
`src/lib/providers.ts`. Today it holds Kotani Pay alone.

| Provider | Switched on | Keys | Prices live | What it carries | Blocking it |
|---|---|---|---|---|---|
| Kotani Pay | yes | sandbox | Yes, onramp and offramp rates | African mobile money in; mobile money and Kenyan or South African banks out | Nothing for pricing. The first real payment is still to run |
| Klasha | no | sandbox keys saved, no login yet | No | Asia: China by its CNY payout, Japan, India, Hong Kong and others by Klasha Wire | Its API token needs the dashboard email and password; and a way to fund it (below) |
| Passpoint | no | none | No (no quote call; estimates) | Banks abroad: USD (US), EUR (SEPA), GBP (UK) | API key; and a way to fund it (below) |
| Yellow Card | no | none | — | Built, unchanged | Business checks, then sandbox keys |

**Ordinary money in, ordinary money out.** A payer always pays in their own
currency and a recipient is always paid in theirs. Kotani carries the money
between the two as USDC in a wallet of ours, which nobody using Meridian sees.

**Payaza is gone.** Its client, webhook, card checkout, OTP step and sandbox
script are deleted. The two jobs it still did now run elsewhere: a business's
payout account is checked through Kotani's account validation, and the
countries a business can sign up from come from the switched-on providers.

### Klasha and Passpoint can pay out, but cannot take money in

Both pay a recipient from a balance Meridian holds with them. Neither has a
collection endpoint we have built, and the router only picks a provider that can
do both ends. So until one of these is decided, neither carries a payment on its
own, and both stay switched off:

1. Meridian keeps a float with Klasha and Passpoint, topped up by hand, and the
   payer pays in through Kotani. This needs the router to allow one provider in
   and another out.
2. Build Klasha's own collections (M-Pesa, bank, card) and its swap API, so a
   Kenyan business pays Klasha in shillings and Klasha pays the supplier in yuan.

### Klasha, 30 October 2026

- Sandbox keys read from its dashboard into `.env.local`: public key, private key,
  the 24-character encryption key and the business id.
- Its current encryption is 3DES (key: the first 24 characters, IV: the first 8).
  Ours was the older AES scheme; it is now 3DES and matches OpenSSL byte for byte.
- Every Klasha call also needs a token from `/auth/account/v2/login` with the
  dashboard email and password. Add `KLASHA_USERNAME` and `KLASHA_PASSWORD` to
  `.env.local` yourself.
- China uses its CNY payout: a B2B quotation, then a transfer to a company bank
  account. The supplier form now asks for the company's registered Chinese name,
  its 18-character unified social credit code, a +86 mobile, city, province and
  postcode. Klasha's Alipay and WeChat payouts are person to person, so they are
  not offered. The docs' B2B examples attach invoices; we send the order without
  attachments, which Klasha may refuse. To confirm.

### Passpoint, 30 October 2026

Built from docs.dev.mypasspoint.com: a token from `merchant-app/get-auth-token`
(merchant id and API key), the cross-border transfer, and its status check. Its
webhooks are signed with HMAC-SHA512 but the docs don't say how, so we check the
status instead. It only answers whitelisted IPs. Needs `PASSPOINT_MERCHANT_ID`,
`PASSPOINT_API_KEY` and `PASSPOINT_USER_APP_CONTEXT` (given at onboarding).

## 1. Kotani Pay

### How a payment runs now

Kotani's fiat invoice endpoint is deprecated, so a payment is three calls:

1. **Wallet.** Each business gets a crypto wallet at Kotani, made the first time
   it is needed and found by name after that.
2. **Onramp.** Kotani prompts the payer's phone. Their cedis buy USDC, which
   lands in that wallet. If we don't know the payer's network, Kotani's phone
   check reads it from the number.
3. **Offramp.** When the USDC has landed, Kotani sells it and pays the recipient
   directly, by mobile money or bank. No separate payout call is needed.

The price is the two rates joined. On 30 October 2026 paying KES 129,000 needed
1,020.37 USDC (Kotani's KES 82 fee included), and that USDC cost about
GH₵12,240. Meridian's 1% is charged on top; it is the USDC left in the wallet.

### Earlier history

The sections below record the fiat flow tried in October, before the switch to
onramp and offramp. The access hold has since been lifted.

### Three things the live test corrected in our code

1. **The address was wrong.** Their guide says each account is given its own
   environment addresses, and ours is on `kotanipay.com`. We had `.io`, which
   answers and looks plausible but rejects every key. Default is now
   `https://sandbox-api.kotanipay.com/api/v3`, still overridable.
2. **A refusal looked like a price.** When a service is off, Kotani answers with
   an empty result rather than no result, so the amounts arrived as "not a
   number" and the payment was ranked as if it were the cheapest. Two guards
   now: the reader rejects amounts that are not real positive numbers, and
   ranking drops any such price before comparing. A provider answering oddly can
   no longer win.
3. **Vodacom is not Vodafone.** Their network names are per country: Vodacom in
   Tanzania, Congo and South Africa, Vodafone in Ghana. Our mapping turned every
   "Voda…" into Vodafone, which would have sent Tanzanian payouts to a network
   that doesn't exist there.

### Their real coverage, from their own list

Eleven countries, each for both paying in and paying out: Congo (CDF),
Côte d'Ivoire and Senegal (XOF), Cameroon (XAF), Ghana (GHS), Kenya (KES),
Rwanda (RWF), Sierra Leone (SLE), Tanzania (TZS), Uganda (UGX),
South Africa (ZAR) and Zambia (ZMW).

Two corrections to what we had assumed: **Kotani does not do Nigeria at all**,
and it does cover Congo and Sierra Leone, which we had left out. Kenya and
South Africa also accept bank and card payments, not only mobile money.

### What is tested without them

Ten browser tests and 160 unit tests run on every change, with Kotani as the
only provider. They cover a buyer in Ghana paying cedis by mobile money and the
business receiving the exact shillings asked for, a Kenyan business paying a
Ghanaian supplier in cedis, a signed Kotani deposit settling a payment and a
forged one being refused, a large first payment to a new supplier being held for
review, and the rules themselves: no crypto offered to anyone, no euro option
for a payer, no China or Japan for a business. Prices in those runs are Kotani's
published fees, not live quotes.

---

## 2. Eversend: reviewed 13 October 2026, recommended as a fifth provider

Reviewed from their public pages (`eversend.co/infra` and the payouts,
collections, exchange and stablecoin funding pages). Not yet tested: it needs an
account at `business.eversend.co`.

**Worth adding.** It is the only provider so far that publishes its exchange
margin, and that margin is lower than everything else we have.

### What they do

| | Detail |
|---|---|
| Collect | Nine African markets: Nigeria, Kenya, Cameroon, Ghana, Uganda, Rwanda, Tanzania, Côte d'Ivoire, Burkina Faso. Bank transfer in Nigeria and Kenya, mobile money elsewhere, Nigerian virtual accounts, and stablecoin from almost anywhere |
| Pay out | Twelve currencies: NGN, KES, XAF, UGX, GHS, RWF, TZS, ZMW, XOF, plus GBP, USD and EUR. Bank and mobile money, 15+ networks |
| Exchange | A price you can lock before converting, across 240+ pairs. Margin stated as "from 0.9%", built into the price |
| Speed | About a minute for mobile money; 57 seconds claimed for Nigerian bank transfers |
| Funding | Pay a balance up front, topped up with USDC or USDT, credited in about five minutes, any day. Funding each payment on the spot is "coming soon" |

### Why it fits what Meridian is for

- **Africa to Africa in local money.** Nine collection markets and nine African
  payout currencies. It overlaps Kotani and Yellow Card almost everywhere, which
  is exactly what the cheapest-wins rule needs: more overlap means lower prices.
- **It is the cheapest exchange margin on the table.** 0.9% against our current
  figures of about 1.7% for Yellow Card on a route not touching the dollar,
  2.75% plus a fixed charge for Klasha, and 5% for Kotani. On Ann's flower
  payments that is real money every shipment.
- **It fills the gap Yellow Card alone covers.** Euros, pounds and dollars are
  the money Chris's European and Middle Eastern buyers pay in, and only Yellow
  Card does that today. A second provider there means a backup, and competition.
- **Euro collection is real.** Eversend gives a European IBAN that a buyer in
  the eurozone can pay into
  ([their announcement](https://blog.eversend.co/eversend-virtual-euro-bank-accounts),
  confirmed 14 October 2026). So Chris's European buyers can pay by ordinary
  bank transfer, not only stablecoin. One condition matters for routing: **the
  money must come from a registered business's account. A payment from a private
  individual is rejected and returned.** Our exporters invoice companies, so that
  fits, but a euro route through Eversend must not be offered to an individual
  payer. Yellow Card has no such restriction documented.
- **It is African.** Eversend is Ugandan, which sits well with what Meridian is.

### What we would not use

Their stablecoin collection and their stablecoin balance top-up. Meridian takes
ordinary money in and pays ordinary money out, so if Eversend is added it is for
its bank and mobile money rails only.

### Where it does not help

- **No yen and no yuan.** Phillip's Japanese car exporters and McLoud's Chinese
  suppliers still need Klasha. Eversend does not replace it.
- **Euro accounts are confirmed for their app, not yet for the API.** The IBAN
  above is described for the Eversend app, and that page says nothing about
  developer access. Their 0.49% plus about €0.99 incoming charge is published
  for their own business accounts, not for the developer product. **To ask them:
  can we open a euro IBAN per payment request through the API, at what price,
  and is the business-sender-only rule the same there?**
- **Money must sit with them.** Payouts come from a balance paid up front, the
  same operational problem we already have with Klasha, until their
  pay-as-you-go funding ships.
- **Developer pricing is not published.** Their pages point to sales. **To ask
  them: the collection and payout charges per country for the API product.**
- **No public API reference.** Only product pages and endpoint names
  (`POST /v1/collections`, `POST /v1/payouts`, `POST /v1/quotes`,
  `GET /v1/balances`, `POST /v1/webhooks`). Signing, webhook checks and error
  shapes are all unknown until we have an account.

### Suggested next step

Sign up at `business.eversend.co/signup`, ask sales for developer pricing and
whether the euro IBAN can be opened through the API, then add it as a sixth
provider. Adding it is a small job: one coverage entry and one adapter, which is
the point of the single-provider routing design.

When it goes in, the euro entry needs the business-sender rule attached, so a
euro route through Eversend is never offered to a payer who is an individual.
