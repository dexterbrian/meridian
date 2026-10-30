import { describe, expect, it } from "vitest";
import { businessCountries, networksFor, payoutMethodsFor } from "./countries";
import {
  klashaCnyQuotationBody,
  klashaCnyQuote,
  klashaCnyTransferBody,
  passpointRail,
  passpointTransferBody,
  type Recipient,
} from "./partner-requests";
import { passpointStatusEvent } from "./partner-webhooks";
import { PROVIDER_IDS, providersFor } from "./providers";

const supplier: Recipient = {
  name: "Shanghai Taohui Trading Co",
  country: "CN",
  currency: "CNY",
  rail: "bank",
  accountNumber: "31050161363900000210",
  bankCode: "105100000017",
  bankName: "China Construction Bank",
  address: "Tingwei Highway",
  china: {
    registeredName: "上海弢汇商务咨询有限公司",
    businessIdNumber: "91310116MA1J9LE95D",
    mobile: "+8613816932352",
    city: "Shanghai",
    state: "Shanghai",
    postcode: "201599",
  },
};

describe("Klasha: paying a company in China", () => {
  it("asks for a B2B bank quotation for the exact yuan", () => {
    expect(klashaCnyQuotationBody({ sourceCurrency: "USD", amount: 70 })).toEqual({
      service: "BANK_ACCOUNT",
      transferType: "B2B",
      destinationCurrency: "CNY",
      sourceCurrency: "USD",
      fundSource: "CASH",
      destinationAmount: "70",
    });
  });

  it("prices the docs' example: USD 9.40 plus a USD 6 fee for CNY 70", () => {
    const q = klashaCnyQuote(
      {
        id: 472,
        sourceAmount: 9.4,
        sourceCurrency: "USD",
        destinationAmount: 70,
        destinationCurrency: "CNY",
        fxRate: 7.44,
        fee: 6,
      },
      "documented",
    );
    expect(q).toMatchObject({ sendAmount: 15.4, receiveAmount: 70, quoteRef: "472" });
  });

  it("names the supplier as registered in China, for a goods purchase", () => {
    const body = klashaCnyTransferBody({
      r: supplier,
      quotationId: 472,
      requestId: "MRDT-ABCDEFGH-P",
      sender: {
        name: "Kilimo Fresh Exports Ltd",
        address: "Moi Avenue",
        city: "Nairobi",
        country: "KE",
      },
      order: { number: "MRDT-ABCDEFGH-P", date: "2026-10-30", amount: 70, product: "Goods" },
    });
    expect(body).toMatchObject({
      accountType: "COMPANY",
      purpose: "GOODS_PURCHASE",
      quotationId: 472,
      receiverBusinessRegisteredName: "上海弢汇商务咨询有限公司",
      receiverBusinessIdType: "UNIFIED_SOCIAL_CREDIT_ID",
      senderBusinessRegisteredName: "Kilimo Fresh Exports Ltd",
      document: { orderCurrency: "CNY", totalAmount: "70" },
    });
  });

  it("refuses a Chinese payout without the company's details", () => {
    expect(() =>
      klashaCnyTransferBody({
        r: { ...supplier, china: undefined },
        quotationId: 1,
        requestId: "r",
        sender: { name: "x", address: "", city: "", country: "KE" },
        order: { number: "r", date: "2026-10-30", amount: 1, product: "Goods" },
      }),
    ).toThrow(/Chinese name/);
  });
});

describe("Passpoint: a bank transfer abroad", () => {
  const us: Recipient = {
    name: "Acme Supplies Inc",
    country: "US",
    currency: "USD",
    rail: "bank",
    accountNumber: "000123456789",
    bankName: "Chase Bank",
    swiftCode: "CHASUS33",
  };

  it("picks SWIFT with a SWIFT code, ACH with a US routing number, else open banking", () => {
    expect(passpointRail(us)).toBe("SWIFT");
    expect(passpointRail({ ...us, swiftCode: undefined, bankCode: "021000021" })).toBe("ACH");
    expect(passpointRail({ ...us, swiftCode: undefined, country: "DE", currency: "EUR" })).toBe(
      "OPEN_BANKING",
    );
  });

  it("matches the docs' example request", () => {
    expect(
      passpointTransferBody({
        r: us,
        amount: 1500,
        sourceCurrency: "NGN",
        reference: "XBORDER_20240115_001",
        description: "Supplier payment",
      }),
    ).toEqual({
      amount: "1500",
      sourceCurrency: "NGN",
      destinationCurrency: "USD",
      rail: "SWIFT",
      recipient: {
        accountName: "Acme Supplies Inc",
        accountNumber: "000123456789",
        bankName: "Chase Bank",
        bankSwiftCode: "CHASUS33",
        country: "US",
      },
      reference: "XBORDER_20240115_001",
      description: "Supplier payment",
    });
  });

  it("reads its transfer status", () => {
    expect(
      passpointStatusEvent("MRDS-1", { status: "SUCCESSFUL", transactionId: "T1" }),
    ).toMatchObject({
      provider: "passpoint",
      stage: "payout",
      outcome: "success",
      partnerRef: "T1",
    });
    expect(passpointStatusEvent("MRDS-1", { status: "pending" })?.outcome).toBe("pending");
    expect(passpointStatusEvent("MRDS-1", {})).toBeNull();
  });

  it("can pay a US bank, but carries nothing alone until it can take money in", () => {
    const kes = { currency: "KES", rail: "momo" as const, country: "KE" };
    const ids = providersFor(
      kes,
      { currency: "USD", rail: "bank", country: "US" },
      PROVIDER_IDS,
    ).map((p) => p.provider);
    // Passpoint only pays out from a balance Meridian holds with it. With no way
    // to take the payer's money in, the router never picks it on its own.
    expect(ids).not.toContain("passpoint");
  });
});

describe("where a business can be based and paid", () => {
  it("lists only African countries a switched-on provider pays out in", () => {
    const c = businessCountries();
    expect(c).toContain("KE");
    expect(c).toContain("GH");
    // Kotani doesn't pay naira, and no other provider is on.
    expect(c).not.toContain("NG");
    expect(c).not.toContain("US");
  });

  it("knows how a Kenyan business can be paid", () => {
    expect(payoutMethodsFor("KES", "KE")).toEqual(["momo", "bank"]);
    expect(payoutMethodsFor("GHS", "GH")).toEqual(["momo"]);
    expect(networksFor("KES").map((n) => n.name)).toContain("M-Pesa (Safaricom)");
  });
});
