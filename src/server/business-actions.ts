"use server";

import type { z } from "zod";
import { namesMatch } from "~/lib/checks";
import { toCsv } from "~/lib/csv";
import type { Tables } from "~/lib/database.types";
import { formatMoney, isCurrency, type Currency } from "~/lib/fees";
import { COUNTRY_NAMES, ISO3, findNetwork } from "~/lib/payaza-codes";
import { makeReference } from "~/lib/reference";
import {
  businessProfileSchema,
  paymentRequestSchema,
  payoutAccountSchema,
  type BusinessProfileInput,
  type PaymentRequestInput,
  type PayoutAccountInput,
} from "~/lib/schemas";
import type { TransactionStatus } from "~/lib/status";
import { currentViewer } from "./auth";
import { sendEmail } from "./email/send";
import { paymentRequestEmail } from "./email/templates";
import { env } from "./env";
import * as payaza from "./partners/payaza";
import { RATE_LIMITED, allowRequest, requestOrigin } from "./request";
import { supabaseAdmin } from "./supabase";

// Server functions for the business area (/app). Each one finds the caller's
// business from the session, never from a client-sent id, then reads and writes
// with the service role.

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

type Business = Tables<"businesses">;
type PayoutAccount = Tables<"payout_accounts">;
type PaymentRequest = Tables<"payment_requests">;
type Transaction = Tables<"transactions">;

function invalid(error: z.ZodError): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? "Please check the form and try again." };
}

const db = () => supabaseAdmin();

async function requireUser() {
  const viewer = await currentViewer();
  if (!viewer) throw new Error("Not signed in");
  return viewer;
}

async function myBusiness(): Promise<Business | null> {
  const viewer = await requireUser();
  const { data } = await db()
    .from("businesses")
    .select()
    .eq("owner_user_id", viewer.id)
    .maybeSingle();
  return data ?? null;
}

async function requireBusiness(): Promise<Business> {
  const b = await myBusiness();
  if (!b) throw new Error("No business profile yet");
  return b;
}

/* --------------------------------- profile -------------------------------- */

export async function getMyBusiness(): Promise<Business | null> {
  return myBusiness();
}

export async function saveBusinessProfile(
  input: BusinessProfileInput,
): Promise<ActionResult<{ business: Business }>> {
  const parsed = businessProfileSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!allowRequest("business")) return { ok: false, error: RATE_LIMITED };
  const viewer = await requireUser();
  const d = parsed.data;
  const row = {
    owner_user_id: viewer.id,
    name: d.name,
    trading_name: d.trading_name || null,
    country: d.country,
    registration_number: d.registration_number || null,
    tax_number: d.tax_number || null,
    address: d.address || null,
    website: d.website || null,
    contact_email: d.contact_email || viewer.email,
    contact_phone: d.contact_phone || null,
  };
  const { data, error } = await db()
    .from("businesses")
    .upsert(row, { onConflict: "owner_user_id" })
    .select()
    .single();
  if (error || !data) {
    console.error("[business] upsert failed", error?.message);
    if (error?.code === "23505")
      return { ok: false, error: "A business with that registration number already exists." };
    return { ok: false, error: "We could not save the profile. Please try again." };
  }
  return { ok: true, business: data };
}

/* ----------------------------- payout accounts ---------------------------- */

export async function listPayoutAccounts(): Promise<PayoutAccount[]> {
  const b = await myBusiness();
  if (!b) return [];
  const { data } = await db()
    .from("payout_accounts")
    .select()
    .eq("business_id", b.id)
    .order("currency")
    .order("is_default", { ascending: false })
    .order("created_at");
  return data ?? [];
}

export type NameCheck = {
  resolvedName: string | null;
  matches: boolean;
  /** In sandbox Payaza returns a canned name, so a mismatch is a warning, not a stop. */
  enforced: boolean;
};

/**
 * Hackathon check: the payout account's name must match the business (Payaza
 * account name enquiry). Payaza's sandbox returns the same canned name for any
 * input, so in sandbox mode a mismatch is recorded and shown, not enforced.
 */
export async function savePayoutAccount(
  input: PayoutAccountInput,
): Promise<ActionResult<{ account: PayoutAccount; check: NameCheck }>> {
  const parsed = payoutAccountSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!allowRequest("business")) return { ok: false, error: RATE_LIMITED };
  const business = await requireBusiness();
  const d = parsed.data;
  if (!(d.country in ISO3))
    return { ok: false, error: "Payaza does not pay out to that country yet." };

  // Editing: the account must be the caller's, and its currency stays fixed,
  // because payments already heading to it are in that currency.
  let existing: PayoutAccount | null = null;
  if (d.id) {
    const { data } = await db()
      .from("payout_accounts")
      .select()
      .eq("id", d.id)
      .eq("business_id", business.id)
      .maybeSingle();
    if (!data) return { ok: false, error: "That payout account was not found." };
    if (data.currency !== d.currency)
      return {
        ok: false,
        error: `This account is in ${data.currency}. To be paid in ${d.currency}, add a new account.`,
      };
    existing = data;
  }
  if (d.method === "momo") {
    const n = findNetwork(d.bank_code);
    if (!n || n.currency !== d.currency)
      return { ok: false, error: "Pick a mobile money network for that currency." };
  }

  const enquiry = await payaza.accountNameEnquiry({
    currency: d.currency,
    bankCode: d.bank_code,
    accountNumber: d.account_number,
  });
  const resolvedName = enquiry.data?.response_content?.account_name ?? null;
  const enforced = env.mode === "live";
  const matches =
    resolvedName !== null &&
    (namesMatch(business.name, resolvedName) ||
      namesMatch(business.trading_name ?? "", resolvedName) ||
      namesMatch(d.account_name, resolvedName));
  if (enforced && !resolvedName) {
    return {
      ok: false,
      error: `Payaza could not find that account (${enquiry.data?.response_message ?? "no answer"}). Check the number and try again.`,
    };
  }
  if (enforced && !matches) {
    return {
      ok: false,
      error: `That account belongs to "${resolvedName}", which does not match ${business.name}. Payouts can only go to the business's own account.`,
    };
  }

  const bankName = d.bank_name || findNetwork(d.bank_code)?.name || d.bank_code;
  const fields = {
    country: d.country,
    method: d.method,
    details: {
      bank_code: d.bank_code,
      bank_name: bankName,
      account_number: d.account_number,
      account_name: d.account_name,
    },
    partner: "payaza",
    validated: matches,
    validated_name: resolvedName,
  };

  let saved: PayoutAccount | null;
  if (existing) {
    const { data, error } = await db()
      .from("payout_accounts")
      .update(fields)
      .eq("id", existing.id)
      .eq("business_id", business.id)
      .select()
      .single();
    if (error) console.error("[payout_accounts] update failed", error.message);
    saved = data ?? null;
  } else {
    // A business's first account in a currency becomes that currency's default.
    const { count } = await db()
      .from("payout_accounts")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("currency", d.currency)
      .eq("is_default", true);
    const { data, error } = await db()
      .from("payout_accounts")
      .insert({ ...fields, business_id: business.id, currency: d.currency, is_default: !count })
      .select()
      .single();
    if (error) console.error("[payout_accounts] insert failed", error.message);
    saved = data ?? null;
  }
  if (!saved) return { ok: false, error: "We could not save the account. Please try again." };
  return { ok: true, account: saved, check: { resolvedName, matches, enforced } };
}

/** Makes one account the default for its currency. Payouts in that currency go there. */
export async function setDefaultPayoutAccount(id: string): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: "Unknown account." };
  if (!allowRequest("business")) return { ok: false, error: RATE_LIMITED };
  const business = await requireBusiness();
  const { error } = await db().rpc("set_default_payout_account", {
    p_business_id: business.id,
    p_account_id: id,
  });
  if (error) {
    console.error("[payout_accounts] set default failed", error.message);
    return { ok: false, error: "Could not make that the default account." };
  }
  return { ok: true };
}

/* ----------------------------- payment requests --------------------------- */

export type RequestRow = PaymentRequest & {
  /** Latest attempt, if any. */
  latest: Pick<
    Transaction,
    "id" | "status" | "reference" | "payer_name" | "payer_email" | "created_at" | "settled_at"
  > | null;
};

export async function createPaymentRequest(
  input: PaymentRequestInput,
): Promise<ActionResult<{ request: PaymentRequest; url: string }>> {
  const parsed = paymentRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!allowRequest("business")) return { ok: false, error: RATE_LIMITED };
  const business = await requireBusiness();
  if (business.kyb_status === "frozen")
    return { ok: false, error: "This business is frozen. Contact support." };
  const d = parsed.data;

  // Idempotency: the same key from the same business returns the first request.
  const { data: existing } = await db()
    .from("payment_requests")
    .select()
    .eq("business_id", business.id)
    .eq("idempotency_key", d.idempotency_key)
    .maybeSingle();
  if (existing)
    return { ok: true, request: existing, url: `${requestOrigin()}/pay/${existing.reference}` };

  const expiresAt =
    d.expires_in_days > 0
      ? new Date(Date.now() + d.expires_in_days * 86_400_000).toISOString()
      : null;
  let request: PaymentRequest | null = null;
  for (let i = 0; i < 3 && !request; i++) {
    const { data, error } = await db()
      .from("payment_requests")
      .insert({
        business_id: business.id,
        reference: makeReference(),
        invoice_number: d.invoice_number || null,
        idempotency_key: d.idempotency_key,
        amount: d.amount,
        currency: d.currency,
        memo: d.memo || null,
        payer_email: d.payer_email || null,
        usage: d.usage,
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (data) request = data;
    else if (error?.code === "23505" && error.message.includes("idempotency")) {
      const { data: again } = await db()
        .from("payment_requests")
        .select()
        .eq("business_id", business.id)
        .eq("idempotency_key", d.idempotency_key)
        .single();
      if (again)
        return { ok: true, request: again, url: `${requestOrigin()}/pay/${again.reference}` };
    } else if (error?.code !== "23505") {
      console.error("[payment_requests] insert failed", error?.message);
      return { ok: false, error: "We could not create the request. Please try again." };
    }
  }
  if (!request) return { ok: false, error: "We could not create the request. Please try again." };

  const url = `${requestOrigin()}/pay/${request.reference}`;
  if (request.payer_email && isCurrency(request.currency)) {
    await sendEmail({
      ...paymentRequestEmail({
        businessName: business.trading_name || business.name,
        reference: request.reference,
        invoiceNumber: request.invoice_number,
        memo: request.memo,
        amount: formatMoney(Number(request.amount), request.currency),
        url,
      }),
      to: request.payer_email,
    });
  }
  return { ok: true, request, url };
}

export async function listPaymentRequests(search = ""): Promise<RequestRow[]> {
  const b = await myBusiness();
  if (!b) return [];
  let q = db()
    .from("payment_requests")
    .select()
    .eq("business_id", b.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const s = search.trim();
  if (s)
    q = q.or(
      `reference.ilike.%${s.replace(/[%,()]/g, "")}%,invoice_number.ilike.%${s.replace(/[%,()]/g, "")}%`,
    );
  const { data: requests } = await q;
  if (!requests?.length) return [];
  const ids = requests.map((r) => r.id);
  const { data: attempts } = await db()
    .from("transactions")
    .select(
      "id, status, reference, payer_name, payer_email, created_at, settled_at, payment_request_id",
    )
    .in("payment_request_id", ids)
    .order("created_at", { ascending: false });
  const latest = new Map<string, NonNullable<RequestRow["latest"]>>();
  for (const a of attempts ?? []) {
    if (a.payment_request_id && !latest.has(a.payment_request_id))
      latest.set(a.payment_request_id, a);
  }
  return requests.map((r) => ({ ...r, latest: latest.get(r.id) ?? null }));
}

export type RequestDetail = {
  request: PaymentRequest;
  attempts: (Transaction & {
    events: Tables<"transaction_events">[];
    flags: Tables<"aml_flags">[];
  })[];
  url: string;
};

export async function getPaymentRequest(reference: string): Promise<RequestDetail | null> {
  const b = await myBusiness();
  if (!b) return null;
  const { data: request } = await db()
    .from("payment_requests")
    .select()
    .eq("business_id", b.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!request) return null;
  const { data: txs } = await db()
    .from("transactions")
    .select()
    .eq("payment_request_id", request.id)
    .order("created_at", { ascending: false });
  const ids = (txs ?? []).map((t) => t.id);
  const [{ data: events }, { data: flags }] = ids.length
    ? await Promise.all([
        db().from("transaction_events").select().in("transaction_id", ids).order("created_at"),
        db().from("aml_flags").select().in("transaction_id", ids).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }];
  return {
    request,
    attempts: (txs ?? []).map((t) => ({
      ...t,
      events: (events ?? []).filter((e) => e.transaction_id === t.id),
      flags: (flags ?? []).filter((f) => f.transaction_id === t.id),
    })),
    url: `${requestOrigin()}/pay/${request.reference}`,
  };
}

export async function disablePaymentRequest(reference: string): Promise<ActionResult> {
  const b = await requireBusiness();
  const { error } = await db()
    .from("payment_requests")
    .update({ status: "disabled" })
    .eq("business_id", b.id)
    .eq("reference", reference)
    .eq("status", "active");
  return error ? { ok: false, error: "Could not disable the link." } : { ok: true };
}

/* -------------------------------- dashboard ------------------------------- */

export type Dashboard = {
  business: Business | null;
  payoutAccounts: PayoutAccount[];
  requests: RequestRow[];
  totals: { settledCount: number; openCount: number; settledByCurrency: Record<string, number> };
  sandbox: boolean;
};

export async function getDashboard(search = ""): Promise<Dashboard> {
  const business = await myBusiness();
  if (!business)
    return {
      business: null,
      payoutAccounts: [],
      requests: [],
      totals: { settledCount: 0, openCount: 0, settledByCurrency: {} },
      sandbox: env.mode === "sandbox",
    };
  const [payoutAccounts, requests, { data: settled }] = await Promise.all([
    listPayoutAccounts(),
    listPaymentRequests(search),
    db()
      .from("transactions")
      .select("send_amount, send_currency")
      .eq("business_id", business.id)
      .eq("status", "settled"),
  ]);
  const settledByCurrency: Record<string, number> = {};
  for (const t of settled ?? [])
    settledByCurrency[t.send_currency] =
      (settledByCurrency[t.send_currency] ?? 0) + Number(t.send_amount);
  return {
    business,
    payoutAccounts,
    requests,
    totals: {
      settledCount: settled?.length ?? 0,
      openCount: requests.filter((r) => r.status === "active").length,
      settledByCurrency,
    },
    sandbox: env.mode === "sandbox",
  };
}

/* ---------------------------------- export -------------------------------- */

export async function exportPaymentsCsv(): Promise<
  ActionResult<{ csv: string; filename: string }>
> {
  const b = await requireBusiness();
  const { data: txs } = await db()
    .from("transactions")
    .select("*, payment_requests(reference, invoice_number, memo)")
    .eq("business_id", b.id)
    .order("created_at", { ascending: false })
    .limit(5000);
  const rows = (txs ?? []).map((t) => {
    const pr = t.payment_requests as unknown as {
      reference: string;
      invoice_number: string | null;
      memo: string | null;
    } | null;
    return {
      date: t.created_at,
      invoice_number: pr?.invoice_number ?? "",
      reference: pr?.reference ?? "",
      attempt: t.reference,
      status: t.status as TransactionStatus,
      currency: t.send_currency,
      amount: Number(t.send_amount),
      payer_paid: Number(t.total_charged),
      partner_fee: Number(t.partner_fee_in),
      meridian_fee: Number(t.meridian_fee),
      method: t.pay_method,
      payer_name: t.payer_name ?? "",
      payer_email: t.payer_email ?? "",
      payer_country: t.payer_country ? (COUNTRY_NAMES[t.payer_country] ?? t.payer_country) : "",
      settled_at: t.settled_at ?? "",
      payout_reference: t.payout_reference ?? "",
      memo: pr?.memo ?? "",
    };
  });
  const csv = toCsv(
    [
      { key: "date", label: "Created" },
      { key: "invoice_number", label: "Invoice number" },
      { key: "reference", label: "Meridian reference" },
      { key: "attempt", label: "Payment reference" },
      { key: "status", label: "Status" },
      { key: "currency", label: "Currency" },
      { key: "amount", label: "Amount received" },
      { key: "payer_paid", label: "Payer paid" },
      { key: "partner_fee", label: "Partner fee" },
      { key: "meridian_fee", label: "Meridian fee" },
      { key: "method", label: "Method" },
      { key: "payer_name", label: "Payer" },
      { key: "payer_email", label: "Payer email" },
      { key: "payer_country", label: "Payer country" },
      { key: "settled_at", label: "Settled" },
      { key: "payout_reference", label: "Payout reference" },
      { key: "memo", label: "Memo" },
    ],
    rows,
  );
  return {
    ok: true,
    csv,
    filename: `meridian-payments-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

export type { Business, PayoutAccount, PaymentRequest, Transaction, Currency };
