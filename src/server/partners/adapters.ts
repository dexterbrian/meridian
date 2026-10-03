import "server-only";
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
  type KlashaWireQuote,
  type KotaniFiatRate,
  type MinisendOfframpQuote,
  type Recipient,
  type YellowCardRate,
} from "~/lib/partner-requests";
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
  | {
      kind: "stablecoin";
      token: "USDC" | "USDT";
      network: string;
      address: string;
      amount: number;
      expiresAt: string | null;
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
  }): Promise<PayoutResult>;
  /** Tells a payer how to pay `quote.sendAmount`. The provider then pays `payoutTo`. */
  collect(input: {
    quote: RouteQuote;
    rail: string;
    reference: string;
    payoutTo: Recipient;
    transactionId?: string;
  }): Promise<PayinInstructions>;
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
  if (rail === "stablecoin") {
    return {
      kind: "stablecoin",
      token: "USDC",
      network: "Base",
      address: "0x000000000000000000000000000000005a4d0b0x".slice(0, 42),
      amount: quote.sendAmount,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      simulated: true,
    };
  }
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

const kotani: Adapter = {
  id: "kotani",
  configured: () => env.kotani !== null,
  async quote(req, basis) {
    const k = env.kotani;
    if (!k) return offline("kotani").quote(req, basis);
    const call = async (amount: number) => {
      const r = await partnerFetch<{ data?: KotaniFiatRate }>({
        partner: "kotani",
        method: "POST",
        url: `${k.baseUrl}/rate/fiat`,
        headers: { Authorization: `Bearer ${k.apiKey}` },
        body: JSON.stringify({ from: req.from.currency, to: req.to.currency, amount }),
      });
      return r.data?.data
        ? kotaniQuote({ from: req.from.currency, to: req.to.currency, reply: r.data.data, basis })
        : null;
    };
    if (req.side === "send") return call(req.amount);
    // Kotani quotes from the source amount. Probe once, then scale to land on the receive amount.
    const probe = await call(req.amount);
    if (!probe || probe.receiveAmount <= 0) return null;
    return call(Math.ceil(((req.amount * probe.sendAmount) / probe.receiveAmount) * 100) / 100);
  },
  async payout({ quote, recipient, reference, transactionId }) {
    const k = env.kotani;
    if (!k) return offline("kotani").payout({ reference });
    const { path, body } = kotaniPayoutBody(
      recipient,
      quote.receiveAmount,
      reference,
      `${env.appUrl}/api/webhooks/kotani`,
    );
    const r = await partnerFetch<{ success?: boolean; message?: string }>({
      partner: "kotani",
      method: "POST",
      url: `${k.baseUrl}${path}`,
      headers: { Authorization: `Bearer ${k.apiKey}` },
      body: JSON.stringify(body),
      transactionId,
    });
    if (!r.ok || r.data?.success === false)
      throw new Error(`Kotani refused the payout: ${r.data?.message ?? `HTTP ${r.status}`}`);
    return { partnerRef: reference, simulated: false };
  },
  async collect(input) {
    // Kotani's offramp (crypto to fiat) returns a deposit address; its request fields
    // aren't in the docs we have, so live stablecoin collection waits on Kotani.
    if (!env.kotani) return offline("kotani").collect(input);
    throw new Error(
      "Kotani stablecoin collection is not wired yet: confirm the offramp create fields with Kotani.",
    );
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

const YC_FEE_PCT = 0.01; // channel fee assumed until GET /business/channels is read per channel

const yellowcard: Adapter = {
  id: "yellowcard",
  configured: () => env.yellowcard !== null,
  async quote(req, basis) {
    if (!env.yellowcard) return offline("yellowcard").quote(req, basis);
    const r = await ycFetch<{ rates?: YellowCardRate[] }>("GET", "/business/rates");
    if (!r.data?.rates) return null;
    return yellowCardQuote({
      rates: r.data.rates,
      from: req.from.currency,
      to: req.to.currency,
      amount: req.amount,
      side: req.side,
      feePct: YC_FEE_PCT,
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
  // Klasha wraps replies in { data }; hand back the inner object.
  return { ok: r.ok, status: r.status, data: r.data?.data ?? null, message: r.data?.message };
}

const klasha: Adapter = {
  id: "klasha",
  configured: () => env.klasha !== null,
  async quote(req, basis) {
    // A binding Klasha Wire quote needs a beneficiary, which needs the recipient's
    // bank details. Before those exist (comparing providers) the estimate stands
    // in; payout() takes the live quote just before paying.
    return estimateQuote("klasha", req, basis);
  },
  async payout({ quote, recipient, reference, transactionId }) {
    if (!env.klasha) return offline("klasha").payout({ reference });
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

/* --------------------------------- Minisend ------------------------------- */

const minisend: Adapter = {
  id: "minisend",
  configured: () => env.minisend !== null,
  async quote(req, basis) {
    const m = env.minisend;
    // Live quotes only for USDC in (offramp); a local-currency payer adds an onramp
    // leg whose quote fields we haven't confirmed, so that route stays an estimate.
    if (!m || req.from.rail !== "stablecoin") return offline("minisend").quote(req, basis);
    const call = async (usdc: number) => {
      const r = await partnerFetch<MinisendOfframpQuote>({
        partner: "minisend",
        method: "POST",
        url: `${m.baseUrl}/api/offramp/quote`,
        headers: { Authorization: `Bearer ${m.apiKey}` },
        body: JSON.stringify({ amount: usdc, currency: req.to.currency }),
      });
      return r.data?.recipient_amount !== undefined
        ? minisendQuote({ reply: r.data, basis })
        : null;
    };
    if (req.side === "send") return call(req.amount);
    const probe = await call(Math.max(1, req.amount / 130));
    if (!probe || probe.receiveAmount <= 0) return null;
    return call(Math.ceil(((req.amount * probe.sendAmount) / probe.receiveAmount) * 100) / 100);
  },
  async payout({ quote, recipient, reference, transactionId }) {
    const m = env.minisend;
    if (!m) return offline("minisend").payout({ reference });
    // Paying out from Meridian's USDC: create an order and fund it from treasury.
    // Funding the deposit is an operational step (PRD 5.6), so the order is left
    // for treasury and reported as pending.
    const r = await partnerFetch<{ order_id?: string }>({
      partner: "minisend",
      method: "POST",
      url: `${m.baseUrl}/api/offramp/orders`,
      headers: { Authorization: `Bearer ${m.apiKey}`, "Idempotency-Key": reference },
      body: JSON.stringify(
        minisendOrderBody(recipient, quote.sendAmount, m.refundAddress, reference),
      ),
      transactionId,
    });
    if (!r.data?.order_id) throw new Error(`Minisend refused the order (HTTP ${r.status}).`);
    return { partnerRef: r.data.order_id, simulated: false };
  },
  async collect(input) {
    const m = env.minisend;
    if (!m) return offline("minisend").collect(input);
    if (input.rail !== "stablecoin") throw new Error("Minisend collects USDC only.");
    // The payer's USDC goes to the order's deposit address; Minisend pays the business directly.
    const r = await partnerFetch<{
      order_id?: string;
      deposit_address?: string;
      total_deposit_usdc?: number;
      expires_at?: string;
    }>({
      partner: "minisend",
      method: "POST",
      url: `${m.baseUrl}/api/offramp/orders`,
      headers: { Authorization: `Bearer ${m.apiKey}`, "Idempotency-Key": input.reference },
      body: JSON.stringify(
        minisendOrderBody(input.payoutTo, input.quote.sendAmount, m.refundAddress, input.reference),
      ),
      transactionId: input.transactionId,
    });
    if (!r.data?.deposit_address)
      throw new Error(`Minisend did not return a deposit address (HTTP ${r.status}).`);
    return {
      kind: "stablecoin",
      token: "USDC",
      network: "Base",
      address: r.data.deposit_address,
      amount: r.data.total_deposit_usdc ?? input.quote.sendAmount,
      expiresAt: r.data.expires_at ?? null,
      simulated: false,
    };
  },
};

/* ---------------------------------- Payaza -------------------------------- */
// Payaza publishes no quote endpoint and converts nothing; its same-currency
// collections run through the existing pay page. Here it competes on
// same-currency payouts using its fee schedule.

const payaza: Adapter = {
  id: "payaza",
  configured: () => true,
  async quote(req, basis) {
    if (req.from.currency !== req.to.currency) return null;
    return estimateQuote("payaza", req, basis);
  },
  async payout({ reference }) {
    if (env.payazaSimulatePayouts || sandbox()) {
      simulatedFailure("payaza");
      return { partnerRef: `SIM-PAYAZA-${reference}`, simulated: true };
    }
    throw new Error("Routed Payaza payouts go through the collection flow's Transfers call.");
  },
  async collect() {
    throw new Error("Payaza collections run through the pay page's own methods.");
  },
};

export const ADAPTERS: Record<ProviderId, Adapter> = {
  payaza,
  kotani,
  yellowcard,
  klasha,
  minisend,
};
