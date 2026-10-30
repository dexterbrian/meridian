// Request builders and reply parsers for Kotani Pay, Yellow Card and Klasha,
// written to each provider's docs. Pure (WebCrypto only), so they run
// on Node and Workers and are unit tested; the HTTP calls live in src/server/partners.
//
// None of these have been run against the providers' live sandboxes yet: Meridian
// has no keys for them. Shapes follow the docs pages cited on each function.

import { withCost, type RouteQuote } from "./routing";
import type { Basis, ProviderId } from "./providers";

const enc = new TextEncoder();

function b64(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

/* ------------------------------- Yellow Card ------------------------------ */
// docs.yellowcard.engineering/docs/authentication-api: sign
// timestamp + path (with /business, no query) + METHOD + base64(sha256(body)) for
// POST/PUT, HMAC with the secret, base64. Headers X-YC-Timestamp and
// Authorization: YcHmacV1 {apiKey}:{signature}.

export async function yellowCardHeaders(input: {
  apiKey: string;
  secret: string;
  method: string;
  /** Full path as sent, including /business, without the query string. */
  path: string;
  body?: string;
  timestamp?: string;
}): Promise<Record<string, string>> {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const method = input.method.toUpperCase();
  let message = `${timestamp}${input.path.split("?")[0]}${method}`;
  if ((method === "POST" || method === "PUT") && input.body !== undefined) {
    message += b64(await crypto.subtle.digest("SHA-256", enc.encode(input.body)));
  }
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = b64(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return { "X-YC-Timestamp": timestamp, Authorization: `YcHmacV1 ${input.apiKey}:${signature}` };
}

export type YellowCardRate = { code: string; buy: number; sell: number };

/**
 * Yellow Card rates are local currency per USD ("always the local currency to the
 * United States Dollar"). A payer selling local currency gets the `sell` side;
 * a recipient buying local currency with USD gets the `buy` side.
 */
export function yellowCardQuote(input: {
  rates: YellowCardRate[];
  from: string;
  to: string;
  amount: number;
  side: "receive" | "send";
  /** A fee as a share of the send amount, for a leg with no channel fee to read. */
  feePct: number;
  /** Flat channel fees in USD (GET /business/channels feeUSD), deposit plus withdraw legs. */
  fixedFeeUsd?: number;
  basis: Basis;
}): RouteQuote | null {
  const r = (c: string) =>
    c === "USD" ? { code: "USD", buy: 1, sell: 1 } : input.rates.find((x) => x.code === c);
  const f = r(input.from);
  const t = r(input.to);
  if (!f || !t || f.sell <= 0 || t.buy <= 0) return null;
  const rate = (1 / f.sell) * t.buy; // to-units per from-unit
  const fixed = (input.fixedFeeUsd ?? 0) * f.sell; // flat fees, in the payer's currency
  let send: number;
  let receive: number;
  if (input.side === "receive") {
    receive = input.amount;
    send = (input.amount / rate + fixed) / (1 - input.feePct);
  } else {
    send = input.amount;
    receive = Math.max(0, (input.amount * (1 - input.feePct) - fixed) * rate);
  }
  return withCost({
    provider: "yellowcard",
    sendCurrency: input.from,
    sendAmount: round2(send),
    receiveCurrency: input.to,
    receiveAmount: round2(receive),
    // Live rates and channel fees. Yellow Card fixes the final price when the
    // payment is submitted, and the payout checks it against this.
    estimated: false,
    basis: input.basis,
    expiresAt: null,
  });
}

/* -------------------------------- Kotani Pay ------------------------------ */
// Kotani carries a payment through a stablecoin it holds for us. The payer
// and the recipient never see it. An onramp turns the payer's mobile money into
// USDC in a crypto wallet of ours; an offramp sells that USDC and pays the
// recipient in their own currency, by mobile money or bank. From Kotani's
// OpenAPI spec (docs/kotani pay openapi.json): POST /rate/onramp, /rate/offramp,
// /onramp and /offramp. Prices checked live on 30 October 2026.

/** A Kotani onramp or offramp price. `value` is units of `to` per unit of `from`. */
export type KotaniRampRate = {
  id?: string;
  value: string | number;
  fiatAmount: number;
  cryptoAmount: number;
  transactionAmount: number;
  fee: number;
  /** Offramp only: what leaves the wallet, in the payout currency, fee included. */
  walletDebitAmount?: number;
};

function usable(r: KotaniRampRate | undefined): r is KotaniRampRate {
  // A refusal still answers with an empty data object, so the amounts arrive
  // undefined. Checked against Kotani's sandbox on 13 October 2026.
  return (
    !!r &&
    Number(r.value) > 0 &&
    Number.isFinite(Number(r.cryptoAmount)) &&
    Number.isFinite(Number(r.fiatAmount))
  );
}

/**
 * The USDC an offramp needs to pay the recipient in full, Kotani's fee
 * included, rounded up to the cent. On 30 October 2026 paying KES 129,000 cost
 * KES 129,082 from the wallet at 126.50625 KES per USDC: 1,020.37 USDC.
 */
export function kotaniCryptoForPayout(offramp: KotaniRampRate): number {
  const debit = Number(
    offramp.walletDebitAmount ?? Number(offramp.fiatAmount) + Number(offramp.fee),
  );
  return Math.ceil((debit / Number(offramp.value)) * 100) / 100;
}

/**
 * One Kotani price: the onramp (payer's money to USDC) and the offramp (USDC to
 * the recipient's money) joined. The payer pays the onramp's fiat amount plus
 * its fee; the recipient gets what the offramp settles.
 */
export function kotaniQuote(input: {
  from: string;
  to: string;
  onramp: KotaniRampRate | undefined;
  offramp: KotaniRampRate | undefined;
  basis: Basis;
}): RouteQuote | null {
  if (!usable(input.onramp) || !usable(input.offramp)) return null;
  const send = Number(input.onramp.fiatAmount) + Number(input.onramp.fee || 0);
  const receive = Number(input.offramp.transactionAmount ?? input.offramp.fiatAmount);
  if (!Number.isFinite(send) || !Number.isFinite(receive) || receive <= 0) return null;
  return withCost({
    provider: "kotani",
    sendCurrency: input.from,
    sendAmount: round2(send),
    receiveCurrency: input.to,
    receiveAmount: round2(receive),
    estimated: false,
    basis: input.basis,
    expiresAt: null,
  });
}

/* ---------------------------------- Klasha -------------------------------- */
// developers.klasha.com/transfers/klasha-wire-api: POST /wallet/wire/generate/quote
// {sourceCurrency, destinationCurrency, beneficiary, destinationAmount} ->
// {quoteToken, rate, sourceFees, destinationFees}. `rate` is source units per
// destination unit (NGN 575.34 per USD in the example).

export type KlashaWireQuote = {
  quoteToken: string;
  rate: number;
  sourceFees: number;
  destinationFees: number;
};

/**
 * The docs don't say who bears `destinationFees`. Meridian's promise is that the
 * recipient gets the full amount, so it is charged to the sender here, converted
 * at the quoted rate; confirm with Klasha.
 */
export function klashaQuote(input: {
  from: string;
  to: string;
  destinationAmount: number;
  reply: KlashaWireQuote;
  basis: Basis;
}): RouteQuote {
  const r = input.reply;
  const send = input.destinationAmount * r.rate + r.sourceFees + r.destinationFees * r.rate;
  return withCost({
    provider: "klasha",
    sendCurrency: input.from,
    sendAmount: round2(send),
    receiveCurrency: input.to,
    receiveAmount: round2(input.destinationAmount),
    estimated: false,
    basis: input.basis,
    expiresAt: null,
    quoteRef: r.quoteToken,
  });
}

/* --------------------------------- payouts -------------------------------- */

export type Recipient = {
  name: string;
  country: string;
  currency: string;
  rail: "momo" | "bank" | "wallet";
  /** Phone number for mobile money; account number, IBAN or wallet id otherwise. */
  accountNumber: string;
  bankName?: string;
  bankCode?: string;
  /** Mobile money network: MPESA, MTN, AIRTEL ... */
  network?: string;
  swiftCode?: string;
  iban?: string;
  address?: string;
  email?: string;
  /**
   * A company in China, for Klasha's CNY payout. Its bank needs the registered
   * Chinese name, the business ID, a mobile number and the address.
   */
  china?: {
    registeredName: string;
    businessIdNumber: string;
    mobile: string;
    city: string;
    state: string;
    postcode: string;
  };
};

/**
 * Taking a payer's money: Kotani prompts their phone, then sends the USDC it
 * buys to our crypto wallet. The payer only ever sees their own currency.
 */
export function kotaniOnrampBody(input: {
  amount: number;
  currency: string;
  phoneNumber: string;
  accountName: string;
  network: string | undefined;
  chain: string;
  token: string;
  walletAddress: string;
  referenceId: string;
  callbackUrl: string;
}) {
  return {
    path: "/onramp",
    body: {
      fiatAmount: input.amount,
      currency: input.currency,
      chain: input.chain,
      token: input.token,
      receiverAddress: input.walletAddress,
      referenceId: input.referenceId,
      callbackUrl: input.callbackUrl,
      mobileMoney: {
        phoneNumber: input.phoneNumber,
        accountName: input.accountName,
        providerNetwork: kotaniNetwork(input.network),
      },
    },
  };
}

/**
 * Paying a recipient: Kotani sells USDC from our wallet and pays them in their
 * own currency. The offramp itself carries the mobile money number or bank
 * account, so no separate payout call is needed. Kotani's spec lists bank
 * payouts for Kenya (a bank code) and South Africa (code 0 and a bank name).
 */
export function kotaniOfframpBody(
  r: Recipient,
  input: {
    cryptoAmount: number;
    chain: string;
    token: string;
    walletAddress: string;
    referenceId: string;
    callbackUrl: string;
    rateId?: string;
  },
) {
  const base = {
    cryptoAmount: input.cryptoAmount,
    currency: r.currency,
    chain: input.chain,
    token: input.token,
    referenceId: input.referenceId,
    senderAddress: input.walletAddress,
    callbackUrl: input.callbackUrl,
    ...(input.rateId ? { rateId: input.rateId } : {}),
  };
  if (r.rail === "momo") {
    return {
      path: "/offramp",
      body: {
        ...base,
        mobileMoneyReceiver: {
          phoneNumber: r.accountNumber,
          accountName: r.name,
          networkProvider: kotaniNetwork(r.network),
        },
      },
    };
  }
  if (r.rail === "bank") {
    return {
      path: "/offramp",
      body: {
        ...base,
        bankReceiver: {
          name: r.name,
          address: r.address ?? "",
          bankCode: Number(r.bankCode ?? 0),
          bankName: r.bankName,
          accountNumber: r.accountNumber,
          country: r.country,
        },
      },
    };
  }
  throw new Error("Kotani pays out to mobile money or a bank account.");
}

/** Kotani names networks MPESA, MTN, AIRTEL, VODACOM, VODAFONE and so on. */
export function kotaniNetwork(network: string | undefined): string | undefined {
  if (!network) return undefined;
  // The names Kotani's own country list returns, read on 13 October 2026.
  // Vodacom (Tanzania, DRC, South Africa) and Vodafone (Ghana) are different
  // networks, so Vodacom has to be matched first.
  if (/mpesa|m-pesa|saf/i.test(network)) return "MPESA";
  if (/vodacom/i.test(network)) return "VODACOM";
  if (/vodafone|telecel/i.test(network)) return "VODAFONE";
  if (/airtel/i.test(network)) return "AIRTEL";
  if (/mtn/i.test(network)) return "MTN";
  if (/orange/i.test(network)) return "ORANGE";
  if (/moov/i.test(network)) return "MOOV";
  if (/wave/i.test(network)) return "WAVE";
  if (/tigo|mixx|yas/i.test(network)) return "TIGO";
  if (/zamtel/i.test(network)) return "ZAMTEL";
  if (/cell\s?c/i.test(network)) return "CELLC";
  return network.toUpperCase();
}

/** Yellow Card submit-send body (disbursement journey: POST /business/payments). */
export function yellowCardPaymentBody(input: {
  r: Recipient;
  localAmount: number;
  channelId: string;
  networkId?: string;
  sequenceId: string;
  sender: { businessName: string; businessId: string };
  reason?: string;
}) {
  return {
    channelId: input.channelId,
    sequenceId: input.sequenceId,
    localAmount: input.localAmount,
    reason: input.reason ?? "other",
    purposeOfRemittance: input.reason ?? "other",
    sender: input.sender,
    destination: {
      accountName: input.r.name,
      accountNumber: input.r.iban ?? input.r.accountNumber,
      accountType: input.r.rail === "momo" ? "momo" : "bank",
      networkId: input.networkId,
      country: input.r.country,
      address: input.r.address,
    },
    forceAccept: false,
  };
}

/** Klasha Wire beneficiary (merchantbeneficiary/create). */
export function klashaBeneficiaryBody(r: Recipient) {
  return {
    accountNumber: r.iban ?? r.accountNumber,
    bankName: r.bankName ?? "",
    beneficiaryName: r.name,
    country: r.country,
    countryCode: r.country,
    currency: r.currency,
    swiftCode: r.swiftCode ?? "",
    iban: r.iban ?? "",
    email: r.email ?? "",
    bankAddress: "",
    beneficiaryAddress: r.address ?? "",
    narration: "Supplier payment",
  };
}

/* ------------------------------ Klasha: China ----------------------------- */
// developers.klasha.com/transfers/payout/cny-payout-new-encryption. A business
// paying a company in China is a B2B transfer to a bank account. First a
// quotation (POST /wallet/merchant/quotation/v2), then the transfer
// (POST /wallet/merchant/{businessId}/bank/transfer/v2/request) with the
// quotation's id. Klasha pays from Meridian's wallet in the source currency.

export type KlashaCnyQuotation = {
  id: number;
  sourceAmount: number;
  sourceCurrency: string;
  destinationAmount: number;
  destinationCurrency: string;
  fxRate: number;
  fee: number;
  expiration?: number;
};

export function klashaCnyQuotationBody(input: { sourceCurrency: string; amount: number }) {
  return {
    service: "BANK_ACCOUNT",
    transferType: "B2B",
    destinationCurrency: "CNY",
    sourceCurrency: input.sourceCurrency,
    fundSource: "CASH",
    destinationAmount: String(input.amount),
  };
}

/**
 * Klasha's quotation as a route quote. The docs' example (USD 9.40 plus a USD 6
 * fee for CNY 70) shows the fee in the source currency, on top.
 */
export function klashaCnyQuote(q: KlashaCnyQuotation, basis: Basis): RouteQuote {
  return withCost({
    provider: "klasha",
    sendCurrency: q.sourceCurrency,
    sendAmount: round2(Number(q.sourceAmount) + Number(q.fee)),
    receiveCurrency: q.destinationCurrency,
    receiveAmount: round2(Number(q.destinationAmount)),
    estimated: false,
    basis,
    expiresAt: q.expiration ? new Date(q.expiration).toISOString() : null,
    quoteRef: String(q.id),
  });
}

/** The CNY B2B bank transfer. Purpose GOODS_PURCHASE: an SME paying its supplier. */
export function klashaCnyTransferBody(input: {
  r: Recipient;
  quotationId: number;
  requestId: string;
  sender: { name: string; address: string; city: string; country: string };
  order: { number: string; date: string; amount: number; product: string };
}) {
  const c = input.r.china;
  if (!c) throw new Error("A payment to China needs the company's Chinese name, ID and address.");
  return {
    accountName: c.registeredName,
    accountNumber: input.r.accountNumber,
    accountType: "COMPANY",
    bankCode: input.r.bankCode ?? "",
    bankName: input.r.bankName ?? "",
    creditAccountCountry: "CN",
    purpose: "GOODS_PURCHASE",
    quotationId: input.quotationId,
    requestId: input.requestId,
    receiverBusinessRegisteredName: c.registeredName,
    receiverBusinessIdNumber: c.businessIdNumber,
    receiverBusinessIdType: "UNIFIED_SOCIAL_CREDIT_ID",
    receiverBusinessMobileNumber: c.mobile,
    receiverBusinessAddress: {
      city: c.city,
      streetAddress: input.r.address ?? "",
      countryCode: "CN",
      postcode: c.postcode,
      state: c.state,
    },
    senderBusinessRegisteredName: input.sender.name,
    senderBusinessAddress: {
      city: input.sender.city,
      streetAddress: input.sender.address,
      countryCode: input.sender.country,
      postcode: "",
      state: input.sender.city,
    },
    document: {
      totalAmount: String(input.order.amount),
      orderNumber: input.order.number,
      orderTime: input.order.date,
      orderCurrency: "CNY",
      tradeType: "GENERAL_GOODS",
      products: [{ name: input.order.product, quantity: "1", productCategory: "HOME_GOODS" }],
    },
  };
}

/* -------------------------------- Passpoint ------------------------------- */
// docs.dev.mypasspoint.com/transfer: POST
// {baseUrl}/{paymentContext}/foreign-ft-app/make-payment/bank. Debits Meridian's
// Passpoint wallet in the source currency; the rate is locked when it starts.

/**
 * Which of Passpoint's rails pays this bank: SWIFT when we have the bank's
 * SWIFT code, ACH for a US account with a routing number, else open banking
 * (EUR and GBP accounts by IBAN or sort code).
 */
export function passpointRail(r: Recipient): "SWIFT" | "ACH" | "OPEN_BANKING" {
  if (r.swiftCode) return "SWIFT";
  if (r.country === "US" && r.bankCode) return "ACH";
  return "OPEN_BANKING";
}

export function passpointTransferBody(input: {
  r: Recipient;
  amount: number;
  sourceCurrency: string;
  reference: string;
  description: string;
}) {
  const r = input.r;
  return {
    amount: String(input.amount),
    sourceCurrency: input.sourceCurrency,
    destinationCurrency: r.currency,
    rail: passpointRail(r),
    recipient: {
      accountName: r.name,
      accountNumber: r.iban || r.accountNumber,
      bankName: r.bankName ?? "",
      ...(r.swiftCode ? { bankSwiftCode: r.swiftCode } : {}),
      country: r.country,
    },
    reference: input.reference,
    description: input.description,
  };
}

export const PROVIDER_REFERENCE_PREFIX: Record<ProviderId, string> = {
  kotani: "MRDK",
  yellowcard: "MRDY",
  klasha: "MRDW",
  passpoint: "MRDS",
};

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
