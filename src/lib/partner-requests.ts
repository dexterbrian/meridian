// Request builders and reply parsers for Kotani Pay, Yellow Card, Klasha and
// Minisend, written to each provider's docs. Pure (WebCrypto only), so they run
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
  /** Channel fee as a share of the send amount. Yellow Card's channels list fees per channel. */
  feePct: number;
  basis: Basis;
}): RouteQuote | null {
  const r = (c: string) =>
    c === "USD" ? { code: "USD", buy: 1, sell: 1 } : input.rates.find((x) => x.code === c);
  const f = r(input.from);
  const t = r(input.to);
  if (!f || !t || f.sell <= 0 || t.buy <= 0) return null;
  const rate = (1 / f.sell) * t.buy; // to-units per from-unit
  let send: number;
  let receive: number;
  if (input.side === "receive") {
    receive = input.amount;
    send = input.amount / rate / (1 - input.feePct);
  } else {
    send = input.amount;
    receive = input.amount * (1 - input.feePct) * rate;
  }
  return withCost({
    provider: "yellowcard",
    sendCurrency: input.from,
    sendAmount: round2(send),
    receiveCurrency: input.to,
    receiveAmount: round2(receive),
    // Rates are live, but the binding price comes from submitting the payment.
    estimated: true,
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
}): RouteQuote {
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

/* --------------------------------- Minisend ------------------------------- */
// docs.minisend.xyz/api-reference/offramp/quote: POST /api/offramp/quote
// {amount (USDC), currency} -> {amount_usdc, rate, amount_local, fee, recipient_amount, expires_at}.

export type MinisendOfframpQuote = {
  amount_usdc: number;
  currency: string;
  rate: number;
  amount_local: number;
  fee: number;
  recipient_amount: number;
  expires_at: string;
};

export function minisendQuote(input: { reply: MinisendOfframpQuote; basis: Basis }): RouteQuote {
  return withCost({
    provider: "minisend",
    sendCurrency: "USD",
    sendAmount: round2(input.reply.amount_usdc),
    receiveCurrency: input.reply.currency,
    receiveAmount: round2(input.reply.recipient_amount),
    estimated: false,
    basis: input.basis,
    expiresAt: input.reply.expires_at,
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

/** Kotani mobile money or bank withdrawal body (withdrawals/mobile-money, withdrawals/bank-v2). */
export function kotaniPayoutBody(
  r: Recipient,
  amount: number,
  referenceId: string,
  callbackUrl: string,
) {
  if (r.rail === "momo") {
    return {
      path: "/withdraw/mobile-money",
      body: {
        amount,
        currency: r.currency,
        referenceId,
        callbackUrl,
        phoneNumber: r.accountNumber,
        network: r.network,
        accountName: r.name,
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

/** Minisend offramp order (offramp/create-order). */
export function minisendOrderBody(
  r: Recipient,
  amountUsdc: number,
  refundAddress: string,
  reference: string,
) {
  return {
    amount: amountUsdc,
    currency: r.currency,
    refund_address: refundAddress,
    reference,
    recipient:
      r.rail === "momo"
        ? {
            method: "mobile_money",
            phone_number: r.accountNumber,
            network: r.network,
            account_name: r.name,
          }
        : {
            method: "bank",
            account_number: r.accountNumber,
            institution: r.bankCode,
            account_name: r.name,
          },
  };
}

export const PROVIDER_REFERENCE_PREFIX: Record<ProviderId, string> = {
  payaza: "MRDP",
  kotani: "MRDK",
  yellowcard: "MRDY",
  klasha: "MRDW",
  minisend: "MRDM",
};

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
