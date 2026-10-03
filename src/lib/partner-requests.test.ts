import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  klashaBeneficiaryBody,
  klashaQuote,
  kotaniPayoutBody,
  kotaniQuote,
  minisendOrderBody,
  minisendQuote,
  yellowCardHeaders,
  yellowCardPaymentBody,
  yellowCardQuote,
  type Recipient,
} from "./partner-requests";

describe("Yellow Card request signing", () => {
  it("signs timestamp + path + METHOD + base64(sha256(body)) with HMAC-SHA256", async () => {
    const body = JSON.stringify({ amount: 10 });
    const ts = "2026-10-03T10:00:00.000Z";
    const h = await yellowCardHeaders({
      apiKey: "key1",
      secret: "s3cret",
      method: "post",
      path: "/business/payments?x=1",
      body,
      timestamp: ts,
    });
    const bodyHash = createHash("sha256").update(body).digest("base64");
    const expected = createHmac("sha256", "s3cret")
      .update(`${ts}/business/paymentsPOST${bodyHash}`)
      .digest("base64");
    expect(h).toEqual({ "X-YC-Timestamp": ts, Authorization: `YcHmacV1 key1:${expected}` });
  });

  it("leaves the body hash out of GET requests and the query out of the path", async () => {
    const ts = "2026-10-03T10:00:00.000Z";
    const h = await yellowCardHeaders({
      apiKey: "k",
      secret: "s",
      method: "GET",
      path: "/business/rates?currency=KES",
      timestamp: ts,
    });
    const expected = createHmac("sha256", "s").update(`${ts}/business/ratesGET`).digest("base64");
    expect(h.Authorization).toBe(`YcHmacV1 k:${expected}`);
  });
});

describe("quote parsers", () => {
  it("Yellow Card: converts through USD using sell then buy", () => {
    const q = yellowCardQuote({
      rates: [
        { code: "NGN", buy: 1500, sell: 1530 },
        { code: "KES", buy: 128, sell: 130 },
      ],
      from: "NGN",
      to: "KES",
      amount: 1000,
      side: "send",
      feePct: 0.01,
      basis: "assumed",
    })!;
    expect(q.receiveAmount).toBeCloseTo(1000 * 0.99 * (128 / 1530), 2);
    expect(q.cost).toBeGreaterThan(0);
  });

  it("Yellow Card: returns null for a currency it has no rate for", () => {
    expect(
      yellowCardQuote({
        rates: [],
        from: "JPY",
        to: "KES",
        amount: 1,
        side: "send",
        feePct: 0,
        basis: "assumed",
      }),
    ).toBeNull();
  });

  it("Kotani: payer pays amount plus deposit fee, recipient gets converted amount less withdrawal fee", () => {
    const q = kotaniQuote({
      from: "USD",
      to: "KES",
      basis: "documented",
      reply: {
        value: "130.5",
        depositAmount: 100,
        withdrawalAmount: 13050,
        depositTransactionAmount: 102.5,
        withdrawalTransactionAmount: 12720,
        depositFee: 2.5,
        withdrawalFee: 330,
      },
    });
    expect(q).toMatchObject({ sendAmount: 102.5, receiveAmount: 12720, estimated: false });
  });

  it("Minisend: USDC in, local currency out, with the quote's expiry", () => {
    const q = minisendQuote({
      basis: "documented",
      reply: {
        amount_usdc: 10,
        currency: "KES",
        rate: 129.45,
        amount_local: 1294,
        fee: 13,
        recipient_amount: 1281,
        expires_at: "2026-07-05T12:05:00.000Z",
      },
    });
    expect(q).toMatchObject({
      sendCurrency: "USD",
      sendAmount: 10,
      receiveCurrency: "KES",
      receiveAmount: 1281,
      expiresAt: "2026-07-05T12:05:00.000Z",
    });
  });

  it("Klasha: sender pays destination amount at the quoted rate plus both fees", () => {
    const q = klashaQuote({
      from: "NGN",
      to: "USD",
      destinationAmount: 1000,
      basis: "documented",
      reply: { quoteToken: "qt1", rate: 575.3385, sourceFees: 15821.81, destinationFees: 27.5 },
    });
    expect(q.receiveAmount).toBe(1000);
    expect(q.sendAmount).toBeCloseTo(1000 * 575.3385 + 15821.81 + 27.5 * 575.3385, 1);
    expect(q.quoteRef).toBe("qt1");
  });
});

describe("payout bodies", () => {
  const momo: Recipient = {
    name: "Ann Flowers",
    country: "KE",
    currency: "KES",
    rail: "momo",
    accountNumber: "254712345678",
    network: "MPESA",
  };
  const bank: Recipient = {
    name: "Shenzhen Tools Co",
    country: "CN",
    currency: "CNY",
    rail: "bank",
    accountNumber: "6222000011112222",
    bankName: "ICBC",
    swiftCode: "ICBKCNBJ",
  };

  it("Kotani: mobile money and bank go to their own endpoints", () => {
    expect(kotaniPayoutBody(momo, 1000, "MRDK-1", "https://x/cb")).toMatchObject({
      path: "/withdraw/mobile-money",
      body: { phoneNumber: "254712345678", network: "MPESA" },
    });
    expect(
      kotaniPayoutBody({ ...momo, rail: "bank", bankCode: "01" }, 1000, "MRDK-2", "https://x/cb")
        .path,
    ).toBe("/withdraw/v2/bank");
  });

  it("Yellow Card: destination carries account type, IBAN when given, and business sender", () => {
    const b = yellowCardPaymentBody({
      r: { ...bank, currency: "EUR", country: "FR", iban: "FR7630006000011234567890189" },
      localAmount: 500,
      channelId: "ch1",
      sequenceId: "MRDY-1",
      sender: { businessName: "Kilimo", businessId: "B1" },
    });
    expect(b.destination).toMatchObject({
      accountNumber: "FR7630006000011234567890189",
      accountType: "bank",
      country: "FR",
    });
    expect(b.sender).toEqual({ businessName: "Kilimo", businessId: "B1" });
  });

  it("Klasha: beneficiary carries SWIFT and currency for the wire", () => {
    expect(klashaBeneficiaryBody(bank)).toMatchObject({
      beneficiaryName: "Shenzhen Tools Co",
      currency: "CNY",
      swiftCode: "ICBKCNBJ",
      countryCode: "CN",
    });
  });

  it("Minisend: mobile money recipient on an offramp order", () => {
    expect(minisendOrderBody(momo, 50, "0xabc", "MRDM-1")).toMatchObject({
      amount: 50,
      currency: "KES",
      recipient: { method: "mobile_money", phone_number: "254712345678" },
    });
  });
});
