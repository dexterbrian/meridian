import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  klashaBeneficiaryBody,
  klashaQuote,
  kotaniCryptoForPayout,
  kotaniNetwork,
  kotaniOfframpBody,
  kotaniOnrampBody,
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

  // Kotani's own replies on 30 October 2026, for KES 129,000 paid from cedis.
  const offramp = {
    id: "rate-off",
    value: "126.50625",
    fiatAmount: 129000,
    transactionAmount: 129000,
    cryptoAmount: 1019.71,
    fee: 82,
    walletDebitAmount: 129082,
  };

  it("Kotani: the USDC an offramp needs covers its fee, rounded up", () => {
    // 129,082 / 126.50625 = 1,020.3607, rounded up.
    expect(kotaniCryptoForPayout(offramp)).toBe(1020.37);
  });

  it("Kotani: the payer pays the onramp price and fee; the recipient gets what the offramp settles", () => {
    const q = kotaniQuote({
      from: "GHS",
      to: "KES",
      basis: "documented",
      offramp,
      onramp: {
        value: "11.9925",
        fiatAmount: 12236.67,
        transactionAmount: 12236.67,
        cryptoAmount: 1020.36,
        fee: 10,
      },
    });
    expect(q).toMatchObject({ sendAmount: 12246.67, receiveAmount: 129000, estimated: false });
  });

  it("Kotani: a refusal shaped like a reply gives no quote, not NaN", () => {
    // Its sandbox answers {success: false, message, data: {}} when a service is
    // off, so the amounts arrive undefined.
    expect(
      kotaniQuote({ from: "GHS", to: "KES", basis: "documented", offramp, onramp: {} as never }),
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

  const ramp = {
    chain: "STELLAR",
    token: "USDC",
    walletAddress: "GBWALLETADDRESS",
    referenceId: "MRD-ABCDEFGH-1-P",
    callbackUrl: "https://x/cb",
  };

  it("Kotani: an offramp pays mobile money straight to the recipient", () => {
    const { path, body } = kotaniOfframpBody(momo, {
      ...ramp,
      cryptoAmount: 1020.36,
      rateId: "r1",
    });
    expect(path).toBe("/offramp");
    expect(body).toMatchObject({
      cryptoAmount: 1020.36,
      currency: "KES",
      senderAddress: "GBWALLETADDRESS",
      rateId: "r1",
      mobileMoneyReceiver: {
        phoneNumber: "254712345678",
        accountName: "Ann Flowers",
        networkProvider: "MPESA",
      },
    });
  });

  it("Kotani: an offramp to a bank carries the account and a numeric bank code", () => {
    const { body } = kotaniOfframpBody(
      { ...momo, rail: "bank", accountNumber: "0123456789", bankCode: "01", address: "Nairobi" },
      { ...ramp, cryptoAmount: 10 },
    );
    expect(body).toMatchObject({
      bankReceiver: { accountNumber: "0123456789", bankCode: 1, country: "KE", address: "Nairobi" },
    });
    expect(body).not.toHaveProperty("mobileMoneyReceiver");
  });

  it("Kotani: refuses a payout it cannot make", () => {
    expect(() =>
      kotaniOfframpBody({ ...momo, rail: "wallet" }, { ...ramp, cryptoAmount: 1 }),
    ).toThrow(/mobile money or a bank/);
  });

  it("Kotani: keeps Vodacom and Vodafone apart", () => {
    // Different networks: Vodacom is Tanzania, DRC and South Africa; Vodafone is Ghana.
    expect(kotaniNetwork("Vodacom")).toBe("VODACOM");
    expect(kotaniNetwork("vodafone")).toBe("VODAFONE");
    expect(kotaniNetwork("M-Pesa")).toBe("MPESA");
    expect(kotaniNetwork("Wave")).toBe("WAVE");
  });

  it("Kotani: an onramp prompts the payer's phone and sends the USDC to our wallet", () => {
    const { path, body } = kotaniOnrampBody({
      ...ramp,
      referenceId: "MRD-ABCDEFGH-1",
      amount: 12370,
      currency: "GHS",
      phoneNumber: "233244123456",
      accountName: "Kwame Mensah",
      network: "MTN",
    });
    expect(path).toBe("/onramp");
    expect(body).toEqual({
      fiatAmount: 12370,
      currency: "GHS",
      chain: "STELLAR",
      token: "USDC",
      receiverAddress: "GBWALLETADDRESS",
      referenceId: "MRD-ABCDEFGH-1",
      callbackUrl: "https://x/cb",
      mobileMoney: {
        phoneNumber: "233244123456",
        accountName: "Kwame Mensah",
        providerNetwork: "MTN",
      },
    });
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
