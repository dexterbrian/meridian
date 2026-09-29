# Payaza API: issues found while building Meridian Collect

| Field | Value |
|---|---|
| From | Appify Softwares Limited (Meridian), Nairobi |
| Contact | Brian Waweru, brian.waweru@appify.co.ke |
| Context | Payaza Borderless Kenya Hackathon, SME and exporter collections track |
| Environment | Test mode: `https://api.payaza.africa/live/…` with `X-TenantID: test` and a test public key |
| Dates tested | 28 and 29 September 2026 |

We built a collection flow on Payaza: mobile money, NGN dynamic virtual accounts, card checkout, account name enquiry and Transfers. Most of it works well in the sandbox. Five things got in our way. Each is written up below with what we sent, what we expected, what came back, and what would help.

Every example uses a placeholder for our key. Nothing below depends on our account; each should reproduce on any test key.

## Summary

| # | Issue | Endpoint | Impact |
|---|---|---|---|
| 1 | Name enquiry returns the same account for every input | `POST /payaza-account/api/v1/mainaccounts/merchant/provider/enquiry` | Can't test account name checks or their error paths |
| 2 | Funding a test virtual account always fails | `POST /merchant-collection/payaza/virtual_account/fund_test_virtual_account` | Can't test an NGN bank transfer end to end in the sandbox |
| 3 | Globus (`140`) virtual accounts fail about half the time | `POST /merchant-collection/merchant/virtual_account/generate_virtual_account` | Payers see random failures if we use Globus |
| 4 | `bvn` is listed as optional but omitting it fails | same as 3 | Cost us time; the error doesn't say what's missing |
| 5 | No published fee table, and no way to get a fee before payment | none exists | We can't show the payer an exact total up front |

We also note some smaller inconsistencies at the end.

---

## 1. Name enquiry returns the same account for every input

**What we sent.** Eight requests with different currencies, bank codes and account numbers, including made-up ones:

| Currency | bank_code | account_number |
|---|---|---|
| NGN | 000014 | 0239573384 |
| NGN | 000013 | 1234567890 |
| KES | SAFKEN | 254712345678 |
| KES | 01 | 0011223344 |
| UGX | MTNUGA | 256772000111 |
| GHS | MTNGHA | 233244000111 |
| TZS | VODTZA | 255754000111 |
| KES | XYZ | 1 |

```bash
curl --request POST \
  --url https://api.payaza.africa/live/payaza-account/api/v1/mainaccounts/merchant/provider/enquiry \
  --header 'Authorization: Payaza <PUBLIC_KEY_BASE64>' \
  --header 'X-TenantID: test' \
  --header 'Content-Type: application/json' \
  --data '{"service_payload":{"currency":"KES","bank_code":"XYZ","account_number":"1"}}'
```

**What we expected.** The number and bank we sent echoed back, a test name, and an error for input that can't be valid (bank code `XYZ`, account number `1`).

**What we got.** The same answer all eight times:

```json
{
  "response_code": 200,
  "response_message": "Approved or completely successful",
  "response_content": {
    "account_number": "0239573384",
    "bank_code": "000014",
    "account_name": "Chibunkem Ojiaku",
    "account_status": "ACTIVE"
  }
}
```

The response even replaces the number and bank code we sent with `0239573384` and `000014`.

**Impact.** We check that a business's payout account belongs to that business before paying money into it. In the sandbox, no business except one named "Chibunkem Ojiaku" can pass, and we can't test what happens when an account doesn't exist. We worked around it with a test business of that name.

**What would help.**
- Echo back the account number and bank code sent.
- A few documented test accounts that return known names, and at least one that returns "not found", so the failure path can be tested.
- Reject input that is plainly invalid, as live mode presumably does.

---

## 2. Funding a test virtual account always fails

**What we did.** Created a dynamic virtual account (this works, see issue 3), then called the documented funding endpoint to play the payer's bank transfer.

```bash
curl --request POST \
  --url https://api.payaza.africa/live/merchant-collection/payaza/virtual_account/fund_test_virtual_account \
  --header 'Authorization: Payaza <PUBLIC_KEY_BASE64>' \
  --header 'X-TenantID: test' \
  --header 'X-ProductID: app' \
  --header 'Content-Type: application/json' \
  --data '{
    "account_name": "Payaza(Chibunkem Ojiaku)",
    "account_number": "<ACCOUNT NUMBER FROM THE CREATE RESPONSE>",
    "initiation_transaction_reference": "<SAME account_reference USED TO CREATE IT>",
    "transaction_amount": "1000",
    "currency": "NGN",
    "source_account_number": "0123456789",
    "source_account_name": "Jill Stones",
    "source_bank_name": "Test Bank"
  }'
```

**What we expected.** `{"message": "Virtual account funded successfully", "success": true}`, then a webhook and a status of "Funds Received".

**What we got.** Never a success, on either issuing bank:

| Account issued by | HTTP | Response |
|---|---|---|
| 78 Finance (`1067`) | 400 | `{"message":"Failed to fund virtual account","success":false}` |
| Globus (`140`) | 200 | `{"message":"Providus funding NA-01","success":false}` |

What we varied, all with the same result:
- with and without `X-TenantID` and `X-ProductID`
- `account_name` as returned (`Payaza(…)`) and without the `Payaza(…)` wrapper
- `transaction_amount` as a string and as a number, whole (`2000`) and with decimals (`2040.82`)
- amount matching the account's amount exactly

Leaving out `initiation_transaction_reference` gives `"Virtual Account Number does not exist"`, so the endpoint does find the account. The status query for the same reference shows it waiting:

```json
{"message":"Transaction data found","data":{"transaction_reference":"MRD-ZK5824-1","amount_received":1000.00,"transaction_status":"Initialized", ...}}
```

**Impact.** The whole NGN bank transfer flow (account created → payer pays → webhook → payout) can't be run in the sandbox. For our demo we record the transfer ourselves in test mode, clearly marked as simulated.

**What would help.**
- A fix, or a note on what the sandbox needs for funding to succeed.
- "Providus funding NA-01" is not something a merchant can act on. A plain message would help.
- A failure should not return HTTP 200.

---

## 3. Globus (`140`) virtual accounts fail about half the time

**What we did.** Created dynamic virtual accounts with `bank_code` `140` and `1067`, several times each, changing only `account_reference`.

```bash
curl --request POST \
  --url https://api.payaza.africa/live/merchant-collection/merchant/virtual_account/generate_virtual_account \
  --header 'Authorization: Payaza <PUBLIC_KEY_BASE64>' \
  --header 'Content-Type: application/json' \
  --data '{
    "account_name": "Chibunkem Ojiaku",
    "account_type": "Dynamic",
    "bank_code": "140",
    "bvn": "",
    "has_amount_validation": "true",
    "account_reference": "MRD-TUC4JBQH-1",
    "customer_first_name": "XYZ",
    "customer_last_name": "Limited",
    "customer_email": "accounts@xyz.co.ke",
    "customer_phone_number": "07012345678",
    "transaction_description": "test",
    "transaction_amount": "2040.82",
    "expires_in_minutes": "30"
  }'
```

**What we got.** Globus fails at random with `{"message":"Virtual account not generated, please try again","success":false}` (HTTP 400). 78 Finance never failed.

| bank_code | Reference style | Tries | Worked |
|---|---|---|---|
| 140 | `MRD-XXXXXXXX-1` (dashes) | 9 | 2 |
| 140 | `MRD_XXXXXXXX_1` (underscores) | 9 | 3 |
| 140 | `MRDXXXXXXXX1` (letters only) | 5 | 3 |
| 1067 | dashes | 13 | 13 |
| 1067 | underscores | 8 | 8 |

All with `"bvn": ""` (see issue 4).

At first we thought Globus rejected dashes. It doesn't: the same request succeeds or fails on retry, whatever the reference looks like.

**Impact.** We use `1067` only. A payer given a Globus account would see random failures.

**What would help.**
- Is `140` expected to work in the sandbox? If it depends on something (reference length, characters, rate limits), please document it.
- A reason in the error instead of "please try again".

---

## 4. `bvn` is listed as optional but omitting it fails

The virtual account docs list `bvn` as not required, with an empty string for dynamic accounts. Without the field at all, the same request fails with `"Virtual account not generated, please try again"`. With `"bvn": ""` it succeeds (on `1067`). The error message didn't point to the missing field, so this took a while to find.

**What would help.** Mark `bvn` as required (empty for dynamic accounts), or accept its absence. And name the missing field in the error.

---

## 5. No published fee table, and no way to get a fee before payment

**What we need.** Our payers cover the fees, so the business receives exactly what it invoiced. To do that, the pay page has to show the payer the full total, fees included, before they pay. That means knowing Payaza's fee for the method and currency the payer picks.

**What we found.**
- The docs have no fee or pricing page, and no endpoint that returns a fee for a proposed charge.
- The fee only appears after payment: in the Web Checkout callback (`transaction_fee`), the transaction status queries (`transaction_fee`), the webhook, and the payment link transactions list (`transaction_fee_amount`).
- Payment links can add the fee on top (`fee_bearer_type: "Customer"`), but they don't say what that fee will be either.
- In the sandbox every fee comes back as `0`, so fee handling can't be tested there.

**Impact.** We keep our own table of fees per method and currency, and compare it with the fee Payaza reports after each payment. If our table is wrong, the payer is charged too much or too little and we only find out afterwards.

**What would help.** Either of these:
- A current fee and rates table, per payment method, currency and country, kept up to date in the docs or the dashboard. Ideally something we can fetch through the API, so our table updates when Payaza's prices change.
- A fee quote endpoint: send an amount, currency and method, get back the fee and the total the payer will pay.

And sandbox fees that match live pricing, so the fee path can be tested.

---

## Smaller inconsistencies

- **Different messages for the same auth problem.** Depending on the service we saw `"Invalid authorization header"`, `"Empty or invalid authorization"` and `"Authorization header is missing"`. The last one appears when the header is present but the key isn't base64-encoded, which is misleading.
- **The `Payaza ` prefix.** The docs say `Authorization: Payaza <base64 key>`. The API playground sends the base64 key with no prefix, and both are accepted on the endpoints we tried. It would help to say which is correct.
- **Which headers go where.** `X-TenantID` is required on some endpoints and not listed on others (virtual account creation has none; funding the same account lists `X-TenantID` and `X-ProductID`). A single table of headers per endpoint would save time.
- **Success flags.** Some responses use `"success": true/false`, others `response_code` as a number (`200`) or a string (`"09"`), and one failure above returns HTTP 200. Consistent status handling would make integrations simpler.

---

We're happy to share full request and response logs for any of the above, or to test fixes. Thank you for the sandbox and the hackathon.
