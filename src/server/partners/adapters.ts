import "server-only";
import {
  klashaBeneficiaryBody,
  klashaCnyQuotationBody,
  klashaCnyQuote,
  klashaCnyTransferBody,
  klashaQuote,
  kotaniCryptoForPayout,
  kotaniOfframpBody,
  kotaniOnrampBody,
  kotaniQuote,
  passpointTransferBody,
  yellowCardHeaders,
  yellowCardPaymentBody,
  yellowCardQuote,
  type KlashaCnyQuotation,
  type KlashaWireQuote,
  type KotaniRampRate,
  type Recipient,
  type YellowCardRate,
} from "~/lib/partner-requests";
import { kotaniStatusEvent, passpointStatusEvent, type RoutedEvent } from "~/lib/partner-webhooks";
import type { Basis, ProviderId } from "~/lib/providers";
import { estimateQuote, type RouteQuote, type RouteRequest } from "~/lib/routing";
import { env } from "../env";
import { klashaEncrypt } from "./klasha-crypto";
import { partnerFetch } from "./http";

// One adapter per routed provider. Each can quote, pay a recipient out, and give
// a payer instructions to pay in. With its keys set it calls the provider (built
// to the docs cited in src/lib/partner-requests.ts; not yet run against their
// live sandboxes). Without keys, in sandbox mode, it returns estimates and
// simulated results, labelled as such. In live mode an adapter without keys
// returns nothing, so the router skips it.

export type PayinInstructions =
  | {
      kind: "bank_transfer";
      scheme: string;
      currency: string;
      amount: number;
      bankName: string;
      accountName: string;
      accountNumber: string;
      routingCode?: string;
      reference: string;
      simulated: boolean;
    }
  | { kind: "momo_prompt"; currency: string; amount: number; phone: string; simulated: boolean };

export type PayoutResult = { partnerRef: string; simulated: boolean };

export interface Adapter {
  id: ProviderId;
  configured(): boolean;
  quote(req: RouteRequest, basis: Basis): Promise<RouteQuote | null>;
  payout(input: {
    quote: RouteQuote;
    recipient: Recipient;
    reference: string;
    transactionId?: string;
    /** The Meridian business the money moves for. Kotani keeps a wallet per business. */
    owner?: string;
    /** The business sending, as a bank abroad must name it. */
    sender?: { name: string; address: string; city: string; country: string };
  }): Promise<PayoutResult>;
  /** Tells a payer how to pay `quote.sendAmount`. The provider then pays `payoutTo`. */
  collect(input: {
    quote: RouteQuote;
    /** What the payer pays: the provider's price plus Meridian's fee. */
    amount: number;
    rail: string;
    reference: string;
    payoutTo: Recipient;
    transactionId?: string;
    /** The Meridian business the money moves for. Kotani keeps a wallet per business. */
    owner?: string;
    /** Who is paying. A mobile money prompt needs their number. */
    payer?: { name: string; phone: string | null; country: string | null; network?: string | null };
  }): Promise<PayinInstructions>;
  /**
   * Asks the provider what happened to a payment, for when its webhook never
   * arrives. Null when it has no answer yet, or the adapter can't ask.
   */
  status?(input: {
    stage: RoutedEvent["stage"];
    reference: string;
    /** For a payout, how the recipient is paid: Kotani keeps mobile money and bank apart. */
    rail: string;
    transactionId?: string;
  }): Promise<{ event: RoutedEvent; raw: unknown } | null>;
}

const sandbox = () => env.mode === "sandbox";

function simulatedFailure(id: ProviderId) {
  if (env.simulateFailures.includes(id)) {
    throw new Error(`${id} is unavailable (simulated failure, PARTNER_SIMULATE_FAIL)`);
  }
}

/** Shared behaviour for an adapter without keys. */
function offline(id: ProviderId) {
  return {
    async quote(req: RouteRequest, basis: Basis) {
      return sandbox() ? estimateQuote(id, req, basis) : null;
    },
    async payout({ reference }: { reference: string }): Promise<PayoutResult> {
      if (!sandbox()) throw new Error(`${id} has no API keys configured.`);
      simulatedFailure(id);
      return { partnerRef: `SIM-${id.toUpperCase()}-${reference}`, simulated: true };
    },
    async collect({
      quote,
      rail,
      reference,
    }: {
      quote: RouteQuote;
      rail: string;
      reference: string;
    }): Promise<PayinInstructions> {
      if (!sandbox()) throw new Error(`${id} has no API keys configured.`);
      simulatedFailure(id);
      return simulatedPayin(id, quote, rail, reference);
    },
  };
}

/** Sandbox stand-ins for payer instructions. Clearly fake numbers, flagged simulated. */
export function simulatedPayin(
  id: ProviderId,
  quote: RouteQuote,
  rail: string,
  reference: string,
): PayinInstructions {
  if (rail === "momo") {
    return {
      kind: "momo_prompt",
      currency: quote.sendCurrency,
      amount: quote.sendAmount,
      phone: "",
      simulated: true,
    };
  }
  const schemes: Record<string, string> = {
    EUR: "SEPA",
    USD: "ACH / wire / SWIFT",
    GBP: "Faster Payments",
  };
  return {
    kind: "bank_transfer",
    scheme: schemes[quote.sendCurrency] ?? "Bank transfer",
    currency: quote.sendCurrency,
    amount: quote.sendAmount,
    bankName: `${id === "yellowcard" ? "Yellow Card" : id} sandbox bank`,
    accountName: "Meridian collections (sandbox)",
    accountNumber: quote.sendCurrency === "EUR" ? "DE00 0000 0000 0000 0000 00" : "000000000000",
    routingCode: quote.sendCurrency === "USD" ? "000000000" : undefined,
    reference,
    simulated: true,
  };
}

/* -------------------------------- Kotani Pay ------------------------------ */
// Money in is an onramp: the payer's mobile money becomes USDC in a crypto
// wallet of ours. Money out is an offramp: that USDC is sold and the recipient
// paid in their own currency. Each business gets its own wallet, so what moved
// for whom is easy to follow.

async function kotaniCall<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  transactionId?: string,
) {
  const k = env.kotani!;
  return partnerFetch<{ success?: boolean; message?: string; data?: T }>({
    partner: "kotani",
    method,
    url: `${k.baseUrl}${path}`,
    headers: { Authorization: `Bearer ${k.apiKey}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    transactionId,
  });
}

type KotaniCryptoWallet = { id: string; name: string; address?: string; chain?: string };
const kotaniWallets = new Map<string, KotaniCryptoWallet>();

/** The business's crypto wallet at Kotani: found by name, or made the first time. */
async function kotaniWallet(owner: string, transactionId?: string): Promise<KotaniCryptoWallet> {
  const chain = env.kotaniChain;
  const name = `meridian-${owner}-${chain.toLowerCase()}`;
  const known = kotaniWallets.get(name);
  if (known) return known;
  const list = await kotaniCall<KotaniCryptoWallet[]>(
    "GET",
    "/wallet/crypto",
    undefined,
    transactionId,
  );
  let wallet = Array.isArray(list.data?.data)
    ? list.data.data.find((w) => w.name === name)
    : undefined;
  if (!wallet) {
    const made = await kotaniCall<KotaniCryptoWallet>(
      "POST",
      "/wallet/crypto",
      { name, chain },
      transactionId,
    );
    if (!made.ok || !made.data?.data?.id)
      throw new Error(
        `Kotani could not make a wallet: ${made.data?.message ?? `HTTP ${made.status}`}`,
      );
    wallet = made.data.data;
  }
  if (!wallet.address) throw new Error("Kotani's wallet has no address to receive into.");
  kotaniWallets.set(name, wallet);
  return wallet;
}

/**
 * The payer's mobile network, when we weren't told it. Kotani's phone check
 * reads it from the number's prefix. Null when it can't tell.
 */
async function kotaniNetworkOf(phone: string, transactionId?: string): Promise<string | null> {
  const r = await kotaniCall<{ network?: string; mno?: string }>(
    "POST",
    "/customer/validate/mobile-money",
    { accountType: "mobile_money", phoneNumber: `+${phone.replace(/^\+/, "")}` },
    transactionId,
  );
  return r.ok ? (r.data?.data?.network ?? r.data?.data?.mno ?? null) : null;
}

async function kotaniRate(
  side: "onramp" | "offramp",
  body: Record<string, unknown>,
  transactionId?: string,
): Promise<KotaniRampRate> {
  const r = await kotaniCall<KotaniRampRate>("POST", `/rate/${side}`, body, transactionId);
  // A refusal comes back as {success: false, message, data: {}} with an HTTP
  // error. Passing the message up lets the router show the real reason.
  if (!r.ok || !r.data?.data)
    throw new Error(r.data?.message ?? `Kotani refused the ${side} price (HTTP ${r.status}).`);
  return r.data.data;
}

const kotani: Adapter = {
  id: "kotani",
  configured: () => env.kotani !== null,
  async quote(req, basis) {
    if (!env.kotani) return offline("kotani").quote(req, basis);
    const token = env.kotaniToken;
    if (req.side === "receive") {
      // Work back from what the recipient must get: the USDC that pays it, then
      // what the payer pays for that USDC.
      const offramp = await kotaniRate("offramp", {
        from: token,
        to: req.to.currency,
        cryptoAmount: req.amount,
        source: "fiat",
      });
      const onramp = await kotaniRate("onramp", {
        from: req.from.currency,
        to: token,
        fiatAmount: kotaniCryptoForPayout(offramp),
        source: "crypto",
      });
      return kotaniQuote({ from: req.from.currency, to: req.to.currency, onramp, offramp, basis });
    }
    const onramp = await kotaniRate("onramp", {
      from: req.from.currency,
      to: token,
      fiatAmount: req.amount,
    });
    const offramp = await kotaniRate("offramp", {
      from: token,
      to: req.to.currency,
      cryptoAmount: Number(onramp.cryptoAmount),
    });
    return kotaniQuote({ from: req.from.currency, to: req.to.currency, onramp, offramp, basis });
  },
  async payout({ quote, recipient, reference, transactionId, owner }) {
    if (!env.kotani) return offline("kotani").payout({ reference });
    if (!owner) throw new Error("A Kotani payout needs the business it is for.");
    const wallet = await kotaniWallet(owner, transactionId);
    // A fresh price for exactly what the recipient must get, so they are paid
    // in full even if the rate moved since the payer paid.
    const offramp = await kotaniRate(
      "offramp",
      {
        from: env.kotaniToken,
        to: recipient.currency,
        cryptoAmount: quote.receiveAmount,
        source: "fiat",
      },
      transactionId,
    );
    const { path, body } = kotaniOfframpBody(recipient, {
      cryptoAmount: kotaniCryptoForPayout(offramp),
      chain: env.kotaniChain,
      token: env.kotaniToken,
      walletAddress: wallet.address!,
      referenceId: reference,
      callbackUrl: `${env.appUrl}/api/webhooks/kotani`,
      rateId: offramp.id,
    });
    const r = await kotaniCall<{ referenceId?: string }>("POST", path, body, transactionId);
    if (!r.ok || r.data?.success === false)
      throw new Error(`Kotani refused the payout: ${r.data?.message ?? `HTTP ${r.status}`}`);
    return { partnerRef: r.data?.data?.referenceId ?? reference, simulated: false };
  },
  async collect(input) {
    if (!env.kotani) return offline("kotani").collect(input);
    if (input.rail !== "momo")
      throw new Error(
        "Kotani takes a payer's money by mobile money. Its card and bank checkout needs a page we have not built.",
      );
    const phone = input.payer?.phone;
    if (!phone) throw new Error("A mobile money payment needs the payer's phone number.");
    if (!input.owner) throw new Error("A Kotani payment needs the business it is for.");
    const wallet = await kotaniWallet(input.owner, input.transactionId);
    const network =
      input.payer?.network ?? (await kotaniNetworkOf(phone, input.transactionId)) ?? undefined;
    // The payer pays the whole price. What the offramp later needs to pay the
    // recipient is less; Meridian's fee is the USDC left in the wallet.
    const { path, body } = kotaniOnrampBody({
      amount: input.amount,
      currency: input.quote.sendCurrency,
      phoneNumber: phone,
      accountName: input.payer?.name ?? "Payer",
      network,
      chain: env.kotaniChain,
      token: env.kotaniToken,
      walletAddress: wallet.address!,
      referenceId: input.reference,
      callbackUrl: `${env.appUrl}/api/webhooks/kotani`,
    });
    const r = await kotaniCall("POST", path, body, input.transactionId);
    if (!r.ok || r.data?.success === false)
      throw new Error(
        `Kotani could not ask for the payment: ${r.data?.message ?? `HTTP ${r.status}`}`,
      );
    // Kotani prompts the phone; the payer approves there and its webhook follows.
    return {
      kind: "momo_prompt",
      currency: input.quote.sendCurrency,
      amount: input.amount,
      phone,
      simulated: false,
    };
  },
  async status({ stage, reference, transactionId }) {
    if (!env.kotani) return null;
    const path = `/${stage === "payin" ? "onramp" : "offramp"}/${encodeURIComponent(reference)}`;
    const r = await kotaniCall("GET", path, undefined, transactionId);
    // Not found, or Kotani down: no answer yet. The next check asks again.
    if (!r.ok) return null;
    const event = kotaniStatusEvent(stage, reference, r.data?.data);
    return event ? { event, raw: r.data } : null;
  },
};

/* -------------------------------- Yellow Card ----------------------------- */

async function ycFetch<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  transactionId?: string,
) {
  const y = env.yellowcard!;
  const raw = body === undefined ? undefined : JSON.stringify(body);
  const headers = await yellowCardHeaders({
    apiKey: y.apiKey,
    secret: y.secret,
    method,
    path,
    body: raw,
  });
  return partnerFetch<T>({
    partner: "yellowcard",
    method,
    url: `${y.baseUrl}${path}`,
    headers,
    body: raw,
    transactionId,
  });
}

/** For a leg with no channel to read a fee from (a virtual account deposit). Assumed. */
const YC_FALLBACK_FEE_PCT = 0.01;

type YcChannel = {
  id: string;
  country: string;
  currency: string;
  channelType: string;
  rampType: "deposit" | "withdraw";
  status: string;
  feeUSD?: number;
};

let ycChannels: { list: YcChannel[]; until: number } | null = null;

/** Yellow Card's channels, cached for ten minutes: fees and availability change rarely. */
async function ycChannelList(): Promise<YcChannel[]> {
  if (ycChannels && ycChannels.until > Date.now()) return ycChannels.list;
  const r = await ycFetch<{ channels?: YcChannel[] }>("GET", "/business/channels");
  const list = r.data?.channels ?? [];
  if (list.length) ycChannels = { list, until: Date.now() + 10 * 60_000 };
  return list;
}

function ycChannelFor(
  list: YcChannel[],
  e: { currency: string; rail: string; country?: string },
  ramp: "deposit" | "withdraw",
) {
  const type = e.rail === "momo" ? "momo" : e.rail === "bank" ? "bank" : null;
  if (!type) return null;
  return (
    list.find(
      (c) =>
        c.rampType === ramp &&
        c.status === "active" &&
        c.channelType === type &&
        c.currency === e.currency &&
        (!e.country || c.country === e.country),
    ) ?? null
  );
}

const yellowcard: Adapter = {
  id: "yellowcard",
  configured: () => env.yellowcard !== null,
  async quote(req, basis) {
    if (!env.yellowcard) return offline("yellowcard").quote(req, basis);
    const [r, channels] = await Promise.all([
      ycFetch<{ rates?: YellowCardRate[] }>("GET", "/business/rates"),
      ycChannelList(),
    ]);
    if (!r.data?.rates) return null;
    // Each leg costs its channel's flat fee. A USD/EUR/GBP account has no
    // deposit channel listed, so that leg takes the assumed share instead.
    const deposit = ycChannelFor(channels, req.from, "deposit");
    const withdraw = ycChannelFor(channels, req.to, "withdraw");
    if (!withdraw) return null; // No active way to pay this recipient right now.
    return yellowCardQuote({
      rates: r.data.rates,
      from: req.from.currency,
      to: req.to.currency,
      amount: req.amount,
      side: req.side,
      feePct: deposit ? 0 : YC_FALLBACK_FEE_PCT,
      fixedFeeUsd: (deposit?.feeUSD ?? 0) + (withdraw.feeUSD ?? 0),
      basis,
    });
  },
  async payout({ quote, recipient, reference, transactionId }) {
    const y = env.yellowcard;
    if (!y) return offline("yellowcard").payout({ reference });
    const ch = await ycFetch<{
      channels?: {
        id: string;
        country: string;
        channelType: string;
        rampType: string;
        status: string;
      }[];
    }>("GET", `/business/channels?country=${recipient.country}`);
    const channel = ch.data?.channels?.find(
      (c) =>
        c.rampType === "withdraw" &&
        c.status === "active" &&
        c.channelType === (recipient.rail === "momo" ? "momo" : "bank"),
    );
    if (!channel)
      throw new Error(
        `Yellow Card has no active ${recipient.rail} send channel for ${recipient.country}.`,
      );
    const submit = await ycFetch<{ id?: string; message?: string }>(
      "POST",
      "/business/payments",
      yellowCardPaymentBody({
        r: recipient,
        localAmount: quote.receiveAmount,
        channelId: channel.id,
        sequenceId: reference,
        sender: { businessName: "Meridian (Appify Softwares Limited)", businessId: y.businessId },
      }),
      transactionId,
    );
    if (!submit.ok || !submit.data?.id)
      throw new Error(
        `Yellow Card refused the payment: ${submit.data?.message ?? `HTTP ${submit.status}`}`,
      );
    const accept = await ycFetch(
      "POST",
      `/business/payments/${submit.data.id}/accept`,
      {},
      transactionId,
    );
    if (!accept.ok)
      throw new Error(
        `Yellow Card did not accept payment ${submit.data.id} (HTTP ${accept.status}).`,
      );
    return { partnerRef: submit.data.id, simulated: false };
  },
  async collect(input) {
    if (!env.yellowcard) return offline("yellowcard").collect(input);
    if (input.rail !== "virtual_account")
      throw new Error("Yellow Card collection here is by virtual account only.");
    // A dedicated USD/EUR/GBP account per payment request (POST /sub-wallets with createVirtualAccount).
    const r = await ycFetch<{
      virtualAccount?: {
        bankName: string;
        accountName: string;
        accountNumber: string;
        routingNumber?: string;
        iban?: string;
      };
    }>(
      "POST",
      "/business/sub-wallets",
      {
        name: input.reference,
        sequenceId: input.reference,
        currency: input.quote.sendCurrency,
        createVirtualAccount: true,
      },
      input.transactionId,
    );
    const va = r.data?.virtualAccount;
    if (!r.ok || !va)
      throw new Error(
        `Yellow Card could not open a ${input.quote.sendCurrency} account (HTTP ${r.status}).`,
      );
    const schemes: Record<string, string> = {
      EUR: "SEPA",
      USD: "ACH / wire / SWIFT",
      GBP: "Faster Payments",
    };
    return {
      kind: "bank_transfer",
      scheme: schemes[input.quote.sendCurrency] ?? "Bank transfer",
      currency: input.quote.sendCurrency,
      amount: input.quote.sendAmount,
      bankName: va.bankName,
      accountName: va.accountName,
      accountNumber: va.iban ?? va.accountNumber,
      routingCode: va.routingNumber,
      reference: input.reference,
      simulated: false,
    };
  },
};

/* ---------------------------------- Klasha -------------------------------- */

let klashaToken: { value: string; until: number } | null = null;

async function klashaAuth(transactionId?: string) {
  const k = env.klasha!;
  if (klashaToken && klashaToken.until > Date.now()) return klashaToken.value;
  const r = await partnerFetch<{ data?: { token?: string } }>({
    partner: "klasha",
    method: "POST",
    url: `${k.baseUrl}/auth/account/v2/login`,
    headers: { "x-auth-token": k.publicKey },
    body: JSON.stringify({ username: k.username, password: k.password }),
    logBody: { username: k.username },
    transactionId,
  });
  const token = r.data?.data?.token;
  if (!token) throw new Error(`Klasha login failed (HTTP ${r.status}).`);
  klashaToken = { value: token, until: Date.now() + 50 * 60_000 };
  return token;
}

/** Klasha's merchant business id, which the CNY transfer path carries. */
function klashaBusinessId(): string {
  const id = env.klashaBusinessId;
  if (!id) throw new Error("KLASHA_BUSINESS_ID is not set.");
  return id;
}

async function klashaPost<T>(path: string, body: unknown, transactionId?: string) {
  const k = env.klasha!;
  const token = await klashaAuth(transactionId);
  const message = await klashaEncrypt(JSON.stringify(body), k.encryptionKey);
  const r = await partnerFetch<{ data?: T; message?: string }>({
    partner: "klasha",
    method: "POST",
    url: `${k.baseUrl}${path}`,
    headers: { Authorization: `Bearer ${token}`, "x-auth-token": k.publicKey },
    body: JSON.stringify({ message }),
    logBody: body,
    transactionId,
  });
  // Klasha wraps most replies in { data }; the CNY payout replies bare.
  const raw = r.data as (Record<string, unknown> & { data?: T; message?: string }) | null;
  const data = (raw?.data ?? (raw && !("data" in raw) ? raw : null)) as T | null;
  return { ok: r.ok, status: r.status, data, message: raw?.message };
}

const klasha: Adapter = {
  id: "klasha",
  configured: () => env.klasha !== null,
  async quote(req, basis) {
    // China: a live quotation, priced for exactly the CNY the supplier gets.
    if (env.klasha && req.to.currency === "CNY" && req.side === "receive") {
      const q = await klashaPost<KlashaCnyQuotation>(
        "/wallet/merchant/quotation/v2",
        klashaCnyQuotationBody({ sourceCurrency: req.from.currency, amount: req.amount }),
      );
      if (!q.ok || !q.data?.id)
        throw new Error(q.message ?? `Klasha refused the quotation (HTTP ${q.status}).`);
      return klashaCnyQuote(q.data, basis);
    }
    // A binding Klasha Wire quote needs a beneficiary, which needs the recipient's
    // bank details. Before those exist (comparing providers) the estimate stands
    // in; payout() takes the live quote just before paying.
    return estimateQuote("klasha", req, basis);
  },
  async payout({ quote, recipient, reference, transactionId, sender }) {
    if (!env.klasha) return offline("klasha").payout({ reference });
    if (recipient.currency === "CNY") {
      // A fresh quotation, then the transfer against it.
      const q = await klashaPost<KlashaCnyQuotation>(
        "/wallet/merchant/quotation/v2",
        klashaCnyQuotationBody({ sourceCurrency: quote.sendCurrency, amount: quote.receiveAmount }),
        transactionId,
      );
      if (!q.ok || !q.data?.id)
        throw new Error(q.message ?? `Klasha refused the quotation (HTTP ${q.status}).`);
      const live = klashaCnyQuote(q.data, "documented");
      if (live.sendAmount > quote.sendAmount * 1.01)
        throw new Error(
          `Klasha's live price (${live.sendAmount} ${live.sendCurrency}) is more than 1% above the price shown.`,
        );
      const sent = await klashaPost<{ id?: number; requestId?: string; payoutStatus?: string }>(
        `/wallet/merchant/${klashaBusinessId()}/bank/transfer/v2/request`,
        klashaCnyTransferBody({
          r: recipient,
          quotationId: q.data.id,
          requestId: reference,
          sender: sender ?? { name: "Meridian business", address: "", city: "", country: "KE" },
          order: {
            number: reference,
            date: new Date().toISOString().slice(0, 10),
            amount: quote.receiveAmount,
            product: "Goods",
          },
        }),
        transactionId,
      );
      if (!sent.ok || !sent.data)
        throw new Error(`Klasha refused the transfer: ${sent.message ?? `HTTP ${sent.status}`}`);
      return { partnerRef: sent.data.requestId ?? reference, simulated: false };
    }
    const ben = await klashaPost<{ token?: string }>(
      "/merchant/merchantbeneficiary/create",
      klashaBeneficiaryBody(recipient),
      transactionId,
    );
    if (!ben.data?.token)
      throw new Error(
        `Klasha could not add the beneficiary: ${ben.message ?? `HTTP ${ben.status}`}`,
      );
    const q = await klashaPost<KlashaWireQuote>(
      "/wallet/wire/generate/quote",
      {
        sourceCurrency: quote.sendCurrency,
        destinationCurrency: recipient.currency,
        beneficiary: ben.data.token,
        destinationAmount: quote.receiveAmount,
      },
      transactionId,
    );
    if (!q.data?.quoteToken) throw new Error("Klasha did not return a wire quote.");
    const live = klashaQuote({
      from: quote.sendCurrency,
      to: recipient.currency,
      destinationAmount: quote.receiveAmount,
      reply: q.data,
      basis: "documented",
    });
    if (live.sendAmount > quote.sendAmount * 1.01) {
      throw new Error(
        `Klasha's live quote (${live.sendAmount} ${live.sendCurrency}) is more than 1% above the quote shown.`,
      );
    }
    const init = await klashaPost<{ transactionReference?: string }>(
      "/wallet/wire/initiate",
      {
        quoteToken: q.data.quoteToken,
        beneficiary: ben.data.token,
        narration: `Meridian ${reference}`.slice(0, 50),
      },
      transactionId,
    );
    if (!init.data?.transactionReference) throw new Error("Klasha did not start the wire.");
    return { partnerRef: init.data.transactionReference, simulated: false };
  },
  async collect(input) {
    if (!env.klasha) return offline("klasha").collect(input);
    throw new Error(
      "Klasha collection from abroad is not offered: its docs list African collections only.",
    );
  },
};

/* --------------------------------- Passpoint ------------------------------ */
// docs.dev.mypasspoint.com: a token from merchant-app/get-auth-token, then the
// cross-border transfer and its status. Passpoint only answers whitelisted IPs.

let passpointToken: { value: string; until: number } | null = null;

async function passpointAuth(transactionId?: string): Promise<string> {
  const p = env.passpoint!;
  if (passpointToken && passpointToken.until > Date.now()) return passpointToken.value;
  const r = await partnerFetch<{
    responseCode?: string;
    responseMessage?: string;
    data?: { accessToken?: string; expiresIn?: number };
  }>({
    partner: "passpoint",
    method: "POST",
    url: `${p.baseUrl}/${p.userAppContext}/merchant-app/get-auth-token`,
    body: JSON.stringify({ merchantId: p.merchantId, apiKey: p.apiKey }),
    logBody: { merchantId: p.merchantId },
    transactionId,
  });
  const token = r.data?.data?.accessToken;
  if (!token)
    throw new Error(`Passpoint sign-in failed: ${r.data?.responseMessage ?? `HTTP ${r.status}`}`);
  // Renew a minute early. The docs' example shows expiresIn 0, so assume ten minutes then.
  const seconds = Number(r.data?.data?.expiresIn) || 600;
  passpointToken = { value: token, until: Date.now() + Math.max(60, seconds - 60) * 1000 };
  return token;
}

async function passpointCall<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  transactionId?: string,
) {
  const p = env.passpoint!;
  const token = await passpointAuth(transactionId);
  return partnerFetch<{
    responseCode?: string;
    responseDescription?: string;
    responseMessage?: string;
    data?: T;
  }>({
    partner: "passpoint",
    method,
    url: `${p.baseUrl}/${p.paymentContext}${path}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-merchant-id": p.merchantId,
      "x-channel-id": p.channelId,
      "x-channel-code": p.channelCode,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    transactionId,
  });
}

const passpoint: Adapter = {
  id: "passpoint",
  configured: () => env.passpoint !== null,
  async quote(req, basis) {
    // The transfer docs have no quote call: the rate is applied when the
    // transfer starts. So Passpoint is priced from the estimate table.
    return estimateQuote("passpoint", req, basis);
  },
  async payout({ quote, recipient, reference, transactionId }) {
    if (!env.passpoint) return offline("passpoint").payout({ reference });
    const r = await passpointCall<{ transactionId?: string; status?: string }>(
      "POST",
      "/foreign-ft-app/make-payment/bank",
      passpointTransferBody({
        r: recipient,
        amount: quote.sendAmount,
        sourceCurrency: quote.sendCurrency,
        reference,
        description: `Supplier payment ${reference}`,
      }),
      transactionId,
    );
    // "00" is Passpoint's success code.
    if (!r.ok || r.data?.responseCode !== "00")
      throw new Error(
        `Passpoint refused the transfer: ${r.data?.responseMessage ?? `HTTP ${r.status}`}`,
      );
    return { partnerRef: r.data.data?.transactionId ?? reference, simulated: false };
  },
  async collect(input) {
    if (!env.passpoint) return offline("passpoint").collect(input);
    throw new Error("Taking a payer's money through Passpoint is not built yet.");
  },
  async status({ stage, reference, transactionId }) {
    if (!env.passpoint || stage !== "payout") return null;
    const r = await passpointCall(
      "GET",
      `/ft-app/transfer-status?reference=${encodeURIComponent(reference)}`,
      undefined,
      transactionId,
    );
    if (!r.ok || r.data?.responseCode !== "00") return null;
    const event = passpointStatusEvent(reference, r.data.data);
    return event ? { event, raw: r.data } : null;
  },
};

export const ADAPTERS: Record<ProviderId, Adapter> = {
  kotani,
  yellowcard,
  klasha,
  passpoint,
};
