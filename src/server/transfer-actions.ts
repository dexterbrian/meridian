"use server";

import type { Tables } from "~/lib/database.types";
import {
  funderOptions,
  payoutDestinations,
  provider as providerProfile,
  type PayerOption,
  type ProviderId,
  type Rail,
} from "~/lib/providers";
import {
  recipientSchema,
  transferSchema,
  type RecipientInput,
  type TransferInput,
} from "~/lib/schemas";
import { currentViewer } from "./auth";
import { env } from "./env";
import { CollectError, type PayinDetails } from "./money/collect";
import {
  createTransfer,
  quoteTransfer,
  simulateRoutedPayin,
  type PricedPlan,
} from "./money/routed";
import { RATE_LIMITED, allowRequest } from "./request";
import { supabaseAdmin } from "./supabase";

// Server functions for sending money to suppliers (/app/send). The business is
// always found from the session, never from a client-sent id.

export type SendResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

type Recipient = Tables<"recipients">;

const db = () => supabaseAdmin();

async function myBusiness() {
  const viewer = await currentViewer();
  if (!viewer) throw new Error("Not signed in");
  const { data } = await db()
    .from("businesses")
    .select()
    .eq("owner_user_id", viewer.id)
    .maybeSingle();
  if (!data) throw new Error("No business profile yet");
  return data;
}

export type SendSetup = {
  country: string;
  funders: PayerOption[];
  destinations: { currency: string; country: string; rails: Rail[] }[];
  sandbox: boolean;
};

export async function getSendSetup(): Promise<SendSetup> {
  const b = await myBusiness();
  const country = b.country ?? "KE";
  return {
    country,
    funders: funderOptions(country),
    destinations: payoutDestinations(),
    sandbox: env.mode === "sandbox",
  };
}

export async function listRecipients(): Promise<Recipient[]> {
  const b = await myBusiness();
  const { data } = await db()
    .from("recipients")
    .select()
    .eq("business_id", b.id)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function saveRecipient(
  input: RecipientInput,
): Promise<SendResult<{ recipient: Recipient }>> {
  const parsed = recipientSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  if (!allowRequest("business")) return { ok: false, error: RATE_LIMITED };
  const b = await myBusiness();
  const r = parsed.data;
  const covered = payoutDestinations().find(
    (d) => d.currency === r.currency && d.country === r.country,
  );
  if (!covered || !covered.rails.includes(r.method)) {
    return {
      ok: false,
      error: `No provider pays ${r.currency} to ${r.method === "momo" ? "mobile money" : r.method} in ${r.country} yet.`,
    };
  }
  const { data, error } = await db()
    .from("recipients")
    .insert({
      business_id: b.id,
      name: r.name,
      country: r.country,
      currency: r.currency,
      method: r.method,
      details: {
        account_number: r.account_number.replace(/\s/g, ""),
        bank_name: r.bank_name,
        bank_code: r.bank_code,
        network: r.network,
        swift_code: r.swift_code,
        iban: r.iban.replace(/\s/g, ""),
        address: r.address,
        email: r.email,
      },
    })
    .select()
    .single();
  if (error || !data)
    return { ok: false, error: "We could not save this recipient. Please try again." };
  return { ok: true, recipient: data };
}

export async function quoteSend(input: {
  recipient_id: string;
  from_currency: string;
  from_rail: Rail;
  amount: number;
}): Promise<SendResult<{ plan: PricedPlan }>> {
  if (!(input.amount > 0)) return { ok: false, error: "Enter an amount." };
  if (!allowRequest("quote")) return { ok: false, error: RATE_LIMITED };
  const b = await myBusiness();
  try {
    const plan = await quoteTransfer(b.id, {
      recipientId: input.recipient_id,
      fromCurrency: input.from_currency,
      fromRail: input.from_rail,
      amount: input.amount,
    });
    return { ok: true, plan };
  } catch (e) {
    if (e instanceof CollectError) return { ok: false, error: e.message };
    console.error("[send] quote failed", e);
    return { ok: false, error: "We could not get prices right now. Please try again." };
  }
}

export type TransferView = {
  id: string;
  reference: string;
  status: string;
  recipientName: string;
  receiveAmount: number;
  receiveCurrency: string;
  sendCurrency: string;
  amount: number;
  providerFee: number;
  meridianFee: number;
  total: number;
  provider: ProviderId | null;
  providerName: string | null;
  attempts: { provider: ProviderId; providerName: string; ok: boolean; error?: string }[];
  payin: PayinDetails | null;
  failureReason: string | null;
  payoutSimulated: boolean;
  sandbox: boolean;
  createdAt: string;
};

function view(tx: Tables<"transactions">, recipientName: string): TransferView {
  const q = (tx.quote ?? {}) as {
    attempts?: { provider: ProviderId; ok: boolean; error?: string }[];
    payoutSimulated?: boolean;
  };
  const provider = (tx.partner_out as ProviderId | null) ?? null;
  return {
    id: tx.id,
    reference: tx.reference,
    status: tx.status,
    recipientName,
    receiveAmount: Number(tx.receive_amount),
    receiveCurrency: tx.receive_currency,
    sendCurrency: tx.send_currency,
    amount: Number(tx.send_amount),
    providerFee: Number(tx.partner_fee_in),
    meridianFee: Number(tx.meridian_fee),
    total: Number(tx.total_charged),
    provider,
    providerName: provider ? providerProfile(provider).name : null,
    attempts: (q.attempts ?? []).map((a) => ({
      ...a,
      providerName: providerProfile(a.provider).name,
    })),
    payin: (tx.payin_details as PayinDetails | null) ?? null,
    failureReason: tx.failure_reason,
    payoutSimulated: q.payoutSimulated === true,
    sandbox: env.mode === "sandbox",
    createdAt: tx.created_at,
  };
}

export async function sendMoney(
  input: TransferInput,
): Promise<SendResult<{ transfer: TransferView }>> {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  if (!allowRequest("business")) return { ok: false, error: RATE_LIMITED };
  const b = await myBusiness();
  try {
    const tx = await createTransfer(b.id, {
      recipientId: parsed.data.recipient_id,
      fromCurrency: parsed.data.from_currency,
      fromRail: parsed.data.from_rail,
      amount: parsed.data.amount,
      idempotencyKey: parsed.data.idempotency_key,
    });
    const t = await getTransfer(tx.id);
    return t ? { ok: true, transfer: t } : { ok: false, error: "Transfer not found." };
  } catch (e) {
    if (e instanceof CollectError) return { ok: false, error: e.message };
    console.error("[send] create failed", e);
    return { ok: false, error: "We could not start this transfer. Please try again." };
  }
}

export async function getTransfer(id: string): Promise<TransferView | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const b = await myBusiness();
  const { data: tx } = await db()
    .from("transactions")
    .select()
    .eq("id", id)
    .eq("business_id", b.id)
    .eq("kind", "transfer")
    .maybeSingle();
  if (!tx) return null;
  const { data: r } = tx.recipient_id
    ? await db().from("recipients").select("name").eq("id", tx.recipient_id).maybeSingle()
    : { data: null };
  return view(tx, r?.name ?? "Recipient");
}

export async function listTransfers(): Promise<TransferView[]> {
  const b = await myBusiness();
  const { data } = await db()
    .from("transactions")
    .select("*, recipients(name)")
    .eq("business_id", b.id)
    .eq("kind", "transfer")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((row) => {
    const { recipients, ...tx } = row as typeof row & { recipients: { name: string } | null };
    return view(tx as Tables<"transactions">, recipients?.name ?? "Recipient");
  });
}

/** Sandbox only: plays the business's money reaching the provider. */
export async function sandboxFundTransfer(id: string): Promise<SendResult> {
  const t = await getTransfer(id);
  if (!t) return { ok: false, error: "Transfer not found." };
  try {
    await simulateRoutedPayin(id);
    return { ok: true };
  } catch (e) {
    if (e instanceof CollectError) return { ok: false, error: e.message };
    return { ok: false, error: "Could not simulate the payment." };
  }
}
