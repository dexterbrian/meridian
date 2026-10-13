# Routed providers: what has been tested, and what each one still needs

| Field | Value |
|---|---|
| Branch | `feat/multi-partner-routing` |
| Last tested | 13 October 2026 |
| How to re-run | `npm run partners:check` (asks each provider with keys for a live price; nothing pays) |

Meridian asks every provider that can carry a payment for a price, uses the
cheapest and keeps the rest as backups. This file records what has actually been
run against each provider, as opposed to built from their documentation.

| Provider | Keys | Reached live | Prices live | Blocking it |
|---|---|---|---|---|
| Kotani Pay | sandbox, 11 October 2026 | Yes | No | Their account has no money services switched on |
| Yellow Card | none | — | — | Needs sandbox keys |
| Klasha | none | — | — | Needs sandbox credentials |
| Minisend | none | — | — | Needs a sandbox key |
| Payaza | live and test | Yes (earlier work) | Same-currency only | Converts nothing, so it only competes on same-currency routes |

---

## 1. Kotani Pay: tested live, 13 October 2026

The sandbox key pair works. Reference data comes back. Every endpoint that
moves money is switched off for the account.

### What was run

| Request | Result |
|---|---|
| `GET /health` | 200, `status: ok` |
| `GET /api/v3/customer/support/countries` with the key | 200, 24 records (12 countries, each listed for paying in and paying out) |
| The same with no key | 401, so the key really is being checked |
| `POST /api/v3/rate/fiat` (GHS to KES) | 403, "The 'rates' service is not enabled for this account." |
| `POST /api/v3/offramp` | 403, `offramp` and `offramp_mobile_money` not enabled |
| `POST /api/v3/onramp` | 403, `onramp` not enabled |
| `POST /api/v3/withdraw/mobile-money` and `/withdraw/v2/bank` | 403, `withdraw` not enabled |
| `POST /api/v3/deposit/mobile-money` | 403, `deposit` not enabled |

Each write was sent with an empty body on purpose, so a working service would
have answered with a validation error and created nothing.

### To ask Kotani to switch on

`rates`, `deposit`, `withdraw`, `onramp`, `offramp` and
`offramp_mobile_money`, for the sandbox account whose key was issued on
11 October 2026. Until `rates` is on, Meridian cannot get a Kotani price, so
Kotani is listed to the payer as unavailable with Kotani's own wording, and
another provider carries the payment.

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

Twelve countries, each for both paying in and paying out: Congo (CDF),
Côte d'Ivoire and Senegal (XOF), Cameroon (XAF), Ghana (GHS), Kenya (KES),
Rwanda (RWF), Sierra Leone (SLE), Tanzania (TZS), Uganda (UGX),
South Africa (ZAR) and Zambia (ZMW).

Two corrections to what we had assumed: **Kotani does not do Nigeria at all**,
and it does cover Congo and Sierra Leone, which we had left out. Kenya and
South Africa also accept bank and card payments, not only mobile money.

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
- **It is African.** Eversend is Ugandan, which sits well with what Meridian is.

### Where it does not help

- **No yen and no yuan.** Phillip's Japanese car exporters and McLoud's Chinese
  suppliers still need Klasha. Eversend does not replace it.
- **Collecting euros from abroad is unconfirmed.** Euros, pounds and dollars
  appear in their collection list, but their page only explains cross-border
  collection by stablecoin. Their 0.49% plus about €0.99 incoming charge is
  published for their own business accounts, not for the developer product. **To
  ask them: can a buyer in Germany pay us by SEPA transfer through the API, and
  at what price?**
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
whether euro collection works through the API, then add it as a sixth provider.
Adding it is a small job: one coverage entry and one adapter, which is the point
of the single-provider routing design.
