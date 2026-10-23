import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  klashaBeneficiaryBody,
  klashaQuote,
  kotaniNetwork,
  kotaniCustomerBody,
  kotaniDepositBody,
  kotaniPayoutBody,
  kotaniQuote,
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

  it("Yellow Card: flat channel fees in USD are charged in the payer's currency", () => {
    const q = yellowCardQuote({
      rates: [
        { code: "NGN", buy: 1500, sell: 1530 },
        { code: "KES", buy: 128, sell: 130 },
      ],
      from: "NGN",
      to: "KES",
      amount: 12800,
      side: "receive",
      feePct: 0,
      fixedFeeUsd: 0.5 + 1,
      basis: "assumed",
    })!;
    // 12,800 KES is 100 USD at the buy rate, so 153,000 NGN, plus 1.5 USD of fees at the sell rate.
    expect(q.sendAmount).toBeCloseTo(153_000 + 1.5 * 1530, 1);
    expect(q.estimated).toBe(false);
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

  it("Kotani: a refusal shaped like a reply gives no quote, not NaN", () => {
    // Its sandbox answers {success: false, message, data: {}} when a service is
    // off, so the amounts arrive undefined.
    expect(
      kotaniQuote({ from: "GHS", to: "KES", basis: "documented", reply: {} as never }),
    ).toBeNull();
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

  it("Kotani: a bank payout carries the account itself, and needs no wallet", () => {
    const { path, body } = kotaniPayoutBody(
      { ...momo, rail: "bank", bankCode: "01" },
      1000,
      "MRDK-2",
      "https://x/cb",
    );
    expect(path).toBe("/withdraw/v2/bank");
    expect(body).toMatchObject({
      currency: "KES",
      amount: 1000,
      bankDetails: { accountNumber: "254712345678", bankCode: "01" },
    });
  });

  it("Kotani: keeps Vodacom and Vodafone apart", () => {
    // Different networks: Vodacom is Tanzania, DRC and South Africa; Vodafone is Ghana.
    expect(kotaniNetwork("Vodacom")).toBe("VODACOM");
    expect(kotaniNetwork("vodafone")).toBe("VODAFONE");
    expect(kotaniNetwork("M-Pesa")).toBe("MPESA");
    expect(kotaniNetwork("Wave")).toBe("WAVE");
  });

  it("Kotani: taking a payment asks the payer's phone, from Meridian's wallet", () => {
    const { path, body } = kotaniDepositBody({
      customerKey: "cus_123",
      amount: 1500,
      walletId: "wal_kes",
      referenceId: "MRD-ABCDEFGH-1",
      callbackUrl: "https://x/cb",
    });
    expect(path).toBe("/deposit/mobile-money");
    // The names Kotani's own validation asked for: snake_case on a deposit.
    expect(body).toMatchObject({
      customer_key: "cus_123",
      amount: 1500,
      wallet_id: "wal_kes",
      reference_id: "MRD-ABCDEFGH-1",
    });
  });

  it("Kotani: a mobile money payout names the customer and the wallet", () => {
    const { path, body } = kotaniPayoutBody(momo, 129000, "MRD-ABCDEFGH-1-P", "https://x/cb", {
      customerKey: "cus_456",
      walletId: "wal_kes",
    });
    expect(path).toBe("/withdraw/mobile-money");
    // A withdrawal spells the wallet camelCase. Kotani's naming, not ours.
    expect(body).toMatchObject({
      customer_key: "cus_456",
      amount: 129000,
      walletId: "wal_kes",
      referenceId: "MRD-ABCDEFGH-1-P",
    });
  });

  it("Kotani: a mobile money payout without a wallet is refused, not sent", () => {
    expect(() => kotaniPayoutBody(momo, 1, "r", "https://x/cb")).toThrow(/customer and a wallet/);
  });

  it("Kotani: a customer carries the network name Kotani uses", () => {
    const { path, body } = kotaniCustomerBody({
      country: "KE",
      phoneNumber: "254712345678",
      network: "M-Pesa",
      accountName: "Hans Müller",
    });
    expect(path).toBe("/customer/mobile-money");
    expect(body).toMatchObject({ country: "KE", phoneNumber: "254712345678", network: "MPESA" });
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
});
