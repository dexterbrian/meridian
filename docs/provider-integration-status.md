# Routed providers: what has been tested, and what each one still needs

| Field | Value |
|---|---|
| Branch | `feat/multi-partner-routing` |
| Last tested | 23 October 2026 |
| How to re-run | `npm run partners:check` (asks each switched-on provider for a live price; nothing pays) |

Meridian asks every provider that can carry a payment for a price, uses the
cheapest and keeps the rest as backups. This file records what has actually been
run against each provider, as opposed to built from their documentation.

## Only Kotani Pay is switched on

One list decides which providers may carry money: `ENABLED_PROVIDERS` in
`src/lib/providers.ts`. Today it holds Payaza, which has always carried
same-currency payments, and Kotani Pay. Yellow Card, Klasha and Minisend are
built and unit-tested but switched off until their business checks and sandbox
keys are done.

Switching one off is not just a routing rule. A payer is never shown a currency
it would have collected, and a business cannot choose a country it would have
paid, so nobody is offered a payment we cannot actually carry. With Kotani alone
that means no euros from Europe, and no payouts to China or Japan.

To turn one back on, add its id to that list. Nothing else changes: the adapter,
the webhook route, the prices and the tests are already there.

| Provider | Switched on | Keys | Reached live | Prices live | Blocking it |
|---|---|---|---|---|---|
| Kotani Pay | yes | sandbox, 11 October 2026 | Yes, until the hold below | No | No exchange rate is set up for any pair |
| Yellow Card | no | none | — | — | Business checks, then sandbox keys |
| Klasha | no | none | — | — | Business checks, then sandbox credentials |
| Minisend | no | none | — | — | Business checks, then a sandbox key |
| Payaza | yes | live and test | Yes (earlier work) | Same-currency only | Converts nothing, so it only competes on same-currency routes |

---

## 1. Kotani Pay

### Where it stands, 23 October 2026

Kotani switched services on for the account. Three of the five we need now
answer; two are still off, and no exchange rate is configured, so Kotani still
cannot price a payment.

| Request | 13 October | 23 October |
|---|---|---|
| Ask for a rate, Ghana cedis to Kenyan shillings | Refused: rates not enabled | Reaches the service. Answers "Rate Not Supported" |
| Take money in by mobile money | Refused: deposit not enabled | Works as far as we can test: it asks for a wallet and a customer |
| Pay out by mobile money, and by bank | Refused: withdraw not enabled | Same: it asks for the account details |
| Take the payer's USDC and pay out (offramp) | Refused: not enabled | Still refused |
| Turn money into USDC (onramp) | Refused: not enabled | Still refused |

Two separate things come back when we ask for a rate. Dollars, euros and naira
are rejected outright as currencies Kotani does not handle. Every pair of its
own African currencies is accepted but has no rate set up. So the service is on
and the account is allowed to use it, but there is nothing in it to quote from.

### A hold on our network

After about forty calls in a few minutes, mapping which pairs and which
endpoints work, Kotani put a temporary block on us. Every request now comes back
"Access from this device or network is temporarily restricted as a security
precaution", including the country list that worked all morning. It is tied to
the network, not the key. **Kotani need to lift it, quoting request id
`1f4f8be6-ea17-4cb3-9c2b-525473c7ae71`.** `npm run partners:check` now reports
this as a hold rather than a failure, so it is obvious when it is lifted.

### What to ask Kotani

1. Lift the access hold, quoting the request id above.
2. Set up exchange rates for the pairs we need, starting with Ghana cedis to
   Kenyan shillings and Kenyan shillings to Ghana cedis. Or tell us which pairs
   the sandbox is meant to price.
3. Switch on `offramp`, `offramp_mobile_money` and `onramp`. Without offramp a
   payer abroad cannot pay by USDC, which is the only way Kotani reaches anyone
   outside its eleven African countries.
4. Confirm how the sandbox wallet works: paying in and paying out both want a
   wallet id and a customer key, and tell us whether the account has a wallet in
   each currency already.

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

Nine browser tests and 161 unit tests run on every change, with Kotani as the
only routed provider. They cover a payer abroad paying in USDC and the business
receiving the exact shillings asked for, a Kenyan business paying a Ghanaian
supplier in cedis, a signed Kotani webhook settling a payment and a forged one
being refused, a large first payment to a new supplier being held for review,
and the switch itself: no euro option for a payer, no China or Japan for a
business. Prices in those runs are Kotani's published fees, not live quotes.

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
  same operational problem we already have with Klasha and Minisend, until their
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
