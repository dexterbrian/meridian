import "server-only";
import {
  klashaBeneficiaryBody,
  klashaQuote,
  kotaniCustomerBody,
  kotaniDepositBody,
  kotaniPayoutBody,
  kotaniQuote,
  yellowCardHeaders,
  yellowCardPaymentBody,
  yellowCardQuote,
  type KlashaWireQuote,
  type KotaniFiatRate,
  type Recipient,
  type YellowCardRate,
} from "~/lib/partner-requests";
import { kotaniStatusEvent, type RoutedEvent } from "~/lib/partner-webhooks";
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

/**
 * Kotani's mobile money works through a saved customer and Meridian's own wallet
 * in that currency. This makes the customer and returns its key.
 */
async function kotaniCustomer(
  base: string,
  apiKey: string,
  who: { country: string; phoneNumber: string; network?: string | null; accountName: string },
  transactionId?: string,
): Promise<string> {
  const { path, body } = kotaniCustomerBody({
    country: who.country,
    phoneNumber: who.phoneNumber,
    network: who.network ?? undefined,
    accountName: who.accountName,
  });
  const r = await partnerFetch<{
    data?: { customerKey?: string; customer_key?: string };
    message?: string;
  }>({
    partner: "kotani",
    method: "POST",
    url: `${base}${path}`,
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    transactionId,
  });
  const key = r.data?.data?.customerKey ?? r.data?.data?.customer_key;
  if (!r.ok || !key)
    throw new Error(`Kotani could not save the customer: ${r.data?.message ?? `HTTP ${r.status}`}`);
  return key;
}

const kotani: Adapter = {
  id: "kotani",
  configured: () => env.kotani !== null,
  async quote(req, basis) {
    const k = env.kotani;
    if (!k) return offline("kotani").quote(req, basis);
    const call = async (amount: number) => {
      const r = await partnerFetch<{ data?: KotaniFiatRate; message?: string }>({
        partner: "kotani",
        method: "POST",
        url: `${k.baseUrl}/rate/fiat`,
        headers: { Authorization: `Bearer ${k.apiKey}` },
        body: JSON.stringify({ from: req.from.currency, to: req.to.currency, amount }),
      });
      // A refusal comes back as {success: false, message, data: {}} with an
      // HTTP error, so the empty data object has to be caught by the status, not
      // by its presence. Passing the message up lets the router show the real
      // reason (e.g. "the 'rates' service is not enabled for this account")
      // instead of a bare "gave no quote". Checked on 13 October 2026.
      if (!r.ok || !r.data?.data) {
        throw new Error(r.data?.message ?? `Kotani refused the quote (HTTP ${r.status}).`);
      }
      return kotaniQuote({
        from: req.from.currency,
        to: req.to.currency,
        reply: r.data.data,
        basis,
      });
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
    let momo: { customerKey: string; walletId: string } | undefined;
    if (recipient.rail === "momo") {
      const walletId = env.kotaniWallet(recipient.currency);
      if (!walletId)
        throw new Error(
          `Kotani has no wallet set for ${recipient.currency} (KOTANI_WALLETS), so it cannot pay out.`,
        );
      momo = {
        walletId,
        customerKey: await kotaniCustomer(
          k.baseUrl,
          k.apiKey,
          {
            country: recipient.country,
            phoneNumber: recipient.accountNumber,
            network: recipient.network,
            accountName: recipient.name,
          },
          transactionId,
        ),
      };
    }
    const { path, body } = kotaniPayoutBody(
      recipient,
      quote.receiveAmount,
      reference,
      `${env.appUrl}/api/webhooks/kotani`,
      momo,
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
    const k = env.kotani;
    if (!k) return offline("kotani").collect(input);
    if (input.rail !== "momo")
      throw new Error(
        "Kotani takes a payer's money by mobile money. Its bank and card collection needs a hosted page we have not built.",
      );
    const phone = input.payer?.phone;
    if (!phone) throw new Error("A mobile money payment needs the payer's phone number.");
    const walletId = env.kotaniWallet(input.quote.sendCurrency);
    if (!walletId)
      throw new Error(
        `Kotani has no wallet set for ${input.quote.sendCurrency} (KOTANI_WALLETS), so it cannot take this payment.`,
      );
    const customerKey = await kotaniCustomer(
      k.baseUrl,
      k.apiKey,
      {
        country: input.payer?.country ?? "",
        phoneNumber: phone,
        network: input.payer?.network,
        accountName: input.payer?.name ?? "Payer",
      },
      input.transactionId,
    );
    // The payer pays the whole price into Meridian's wallet. The payout takes
    // the provider's share; Meridian's fee is what stays behind.
    const { path, body } = kotaniDepositBody({
      customerKey,
      amount: input.amount,
      walletId,
      referenceId: input.reference,
      callbackUrl: `${env.appUrl}/api/webhooks/kotani`,
    });
    const r = await partnerFetch<{ data?: unknown; success?: boolean; message?: string }>({
      partner: "kotani",
      method: "POST",
      url: `${k.baseUrl}${path}`,
      headers: { Authorization: `Bearer ${k.apiKey}` },
      body: JSON.stringify(body),
      transactionId: input.transactionId,
    });
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
  async status({ stage, reference, rail, transactionId }) {
    const k = env.kotani;
    if (!k) return null;
    // One status endpoint per kind of payment, from Kotani's spec.
    const path =
      stage === "payin"
        ? `/deposit/mobile-money/status/${encodeURIComponent(reference)}`
        : rail === "bank"
          ? `/withdraw/v2/bank/status/${encodeURIComponent(reference)}`
          : `/withdraw/status/${encodeURIComponent(reference)}`;
    const r = await partnerFetch<{ data?: unknown }>({
      partner: "kotani",
      method: "GET",
      url: `${k.baseUrl}${path}`,
      headers: { Authorization: `Bearer ${k.apiKey}` },
      transactionId,
    });
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

export const ADAPTERS: Record<ProviderId, Adapter> = {
  kotani,
  yellowcard,
  klasha,
};
