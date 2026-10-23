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
// documentation.kotanipay.com/v3/api-reference/rates/fiat-to-fiat:
// POST /rate/fiat {from, to, amount}; a fee on each leg.

export type KotaniFiatRate = {
  value: string | number;
  depositAmount: number;
  withdrawalAmount: number;
  depositTransactionAmount: number;
  withdrawalTransactionAmount: number;
  depositFee: number;
  withdrawalFee: number;
};

/**
 * One Kotani fiat quote for `amount` in the source currency. The payer pays
 * depositTransactionAmount (amount plus deposit fee); the recipient gets
 * withdrawalTransactionAmount (converted, less withdrawal fee).
 */
export function kotaniQuote(input: {
  from: string;
  to: string;
  reply: KotaniFiatRate;
  basis: Basis;
}): RouteQuote | null {
  // A refusal still answers with an empty data object, so the amounts arrive
  // undefined. Checked against Kotani's sandbox on 13 October 2026.
  if (
    !Number.isFinite(Number(input.reply.depositTransactionAmount)) ||
    !Number.isFinite(Number(input.reply.withdrawalTransactionAmount))
  ) {
    return null;
  }
  return withCost({
    provider: "kotani",
    sendCurrency: input.from,
    sendAmount: round2(input.reply.depositTransactionAmount),
    receiveCurrency: input.to,
    receiveAmount: round2(input.reply.withdrawalTransactionAmount),
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
};

/**
 * Kotani's mobile money endpoints work through a saved customer, not inline
 * phone details. This builds that customer. The field names come from Kotani's
 * docs; the endpoint itself has not been reached yet (their access hold).
 */
export function kotaniCustomerBody(input: {
  country: string;
  phoneNumber: string;
  network: string | undefined;
  accountName: string;
}) {
  return {
    path: "/customer/mobile-money",
    body: {
      country: input.country,
      phoneNumber: input.phoneNumber,
      network: kotaniNetwork(input.network),
      accountName: input.accountName,
    },
  };
}

/**
 * Taking money from a payer by mobile money: Kotani prompts the phone and
 * credits Meridian's wallet in that currency.
 *
 * The required fields are the ones Kotani's own validation named on
 * 23 October 2026: a customer key, an amount and a wallet id (snake_case here,
 * camelCase on the withdrawal below — their naming, not ours). The reference and
 * callback names are from the docs and still unconfirmed.
 */
export function kotaniDepositBody(input: {
  customerKey: string;
  amount: number;
  walletId: string;
  referenceId: string;
  callbackUrl: string;
}) {
  return {
    path: "/deposit/mobile-money",
    body: {
      customer_key: input.customerKey,
      amount: input.amount,
      wallet_id: input.walletId,
      reference_id: input.referenceId,
      callback_url: input.callbackUrl,
    },
  };
}

/**
 * Paying a recipient out. Mobile money pays a saved customer from Meridian's
 * wallet (fields per Kotani's validation, 23 October 2026). A bank payout takes
 * the account inline and no wallet.
 */
export function kotaniPayoutBody(
  r: Recipient,
  amount: number,
  referenceId: string,
  callbackUrl: string,
  momo?: { customerKey: string; walletId: string },
) {
  if (r.rail === "momo") {
    if (!momo) throw new Error("A Kotani mobile money payout needs a customer and a wallet.");
    return {
      path: "/withdraw/mobile-money",
      body: {
        customer_key: momo.customerKey,
        amount,
        walletId: momo.walletId,
        referenceId,
        callbackUrl,
      },
    };
  }
  return {
    path: "/withdraw/v2/bank",
    body: {
      currency: r.currency,
      amount,
      referenceId,
      callbackUrl,
      bankDetails: {
        name: r.name,
        bankCode: r.bankCode ?? "",
        accountNumber: r.accountNumber,
        country: r.country,
        bankName: r.bankName,
      },
    },
  };
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

export const PROVIDER_REFERENCE_PREFIX: Record<ProviderId, string> = {
  kotani: "MRDK",
  yellowcard: "MRDY",
  klasha: "MRDW",
};

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
