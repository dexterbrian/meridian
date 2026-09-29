import "server-only";
import type { Json } from "~/lib/database.types";
import { redact } from "~/lib/redact";
import { env } from "../env";
import { supabaseAdmin } from "../supabase";

// Thin typed client for Payaza. Every call is logged to partner_calls with
// secrets stripped. Nothing in here changes Meridian's state; the callers in
// server/money do that.
//
// Auth (docs.payaza.africa/guides/authentication): one base URL for test and
// live, `Authorization: Payaza base64(public key)`, `X-TenantID: test|live`,
// and `X-ProductID: app` on the mobile money endpoints only.

type Method = "GET" | "POST";

export type PayazaResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  /** The body as text when it was not JSON. */
  text: string | null;
  durationMs: number;
};

type CallOptions = {
  method: Method;
  path: string;
  body?: unknown;
  /** Adds X-ProductID: app (mobile money, XOF, ZAR endpoints). */
  product?: boolean;
  /** Adds X-TenantID. Off for endpoints that reject it. */
  tenant?: boolean;
  transactionId?: string | null;
};

function authHeader() {
  const key = env.payazaPublicKey;
  return `Payaza ${btoa(key)}`;
}

export async function payazaCall<T = unknown>(opts: CallOptions): Promise<PayazaResult<T>> {
  const started = Date.now();
  const headers: Record<string, string> = {
    Authorization: authHeader(),
    Accept: "application/json",
  };
  if (opts.tenant !== false) headers["X-TenantID"] = env.mode === "live" ? "live" : "test";
  if (opts.product) headers["X-ProductID"] = "app";
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let status = 0;
  let data: T | null = null;
  let text: string | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(`${env.payazaBaseUrl}${opts.path}`, {
      method: opts.method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    status = res.status;
    const raw = await res.text();
    try {
      data = raw ? (JSON.parse(raw) as T) : null;
    } catch {
      text = raw.slice(0, 2000);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const durationMs = Date.now() - started;

  try {
    await supabaseAdmin()
      .from("partner_calls")
      .insert({
        partner: "payaza",
        endpoint: `${opts.method} ${opts.path.split("?")[0]}`,
        request: redact({ path: opts.path, body: opts.body ?? null }) as Json,
        response: (data ?? { text, error }) as Json,
        status_code: status || null,
        duration_ms: durationMs,
        transaction_id: opts.transactionId ?? null,
      });
  } catch (e) {
    console.error("[payaza] could not log partner call", e);
  }

  if (error) console.error(`[payaza] ${opts.method} ${opts.path} failed: ${error}`);
  return { ok: status >= 200 && status < 300 && !error, status, data, text, durationMs };
}

/* ------------------------------- collections ------------------------------ */

export type MomoCollectionInput = {
  reference: string;
  amount: number;
  currency: string;
  /** ISO-2 country of the payer's wallet. */
  country: string;
  /** Payaza network code, e.g. SAFKEN. */
  networkCode: string;
  /** International format, digits only. */
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  description: string;
  /** Where Wave / ZAR bring the payer back. */
  redirectUrl?: string;
  transactionId?: string;
};

export type MomoCollectionResponse = {
  response_code: string;
  response_message: string;
  transaction_reference?: string;
  requires_otp?: boolean;
  otp_length?: number;
  before_payment_instruction?: string;
  after_payment_instruction?: string;
  payment_token?: string;
  payee?: string;
  payment_method?: string;
  transaction_channel?: string;
  redirect_customer_to_url_processing?: boolean;
  payment_completion_url?: string;
};

/** Mobile money, XOF and ZAR. Payaza replies "09 PENDING" when the prompt was sent. */
export function processMomoCollection(input: MomoCollectionInput) {
  return payazaCall<MomoCollectionResponse>({
    method: "POST",
    path: "/subsidiary/collections/v1/process-collection",
    product: true,
    transactionId: input.transactionId,
    body: {
      amount: input.amount,
      customer_number: input.phone,
      transaction_reference: input.reference,
      transaction_description: input.description,
      customer_bank_code: input.networkCode,
      currency_code: input.currency,
      customer_email: input.email,
      customer_first_name: input.firstName,
      customer_last_name: input.lastName,
      customer_phone_number: input.phone,
      country_code: input.country,
      ...(input.redirectUrl ? { redirect_url: input.redirectUrl } : {}),
    },
  });
}

export function processXofOtp(input: {
  reference: string;
  otp: string;
  paymentToken: string;
  payee: string;
  paymentMethod: string;
  channel: string;
  country: string;
  transactionId?: string;
}) {
  return payazaCall<MomoCollectionResponse>({
    method: "POST",
    path: "/subsidiary/collections/v1/process-otp",
    product: true,
    transactionId: input.transactionId,
    body: {
      payment_token: input.paymentToken,
      otp_code: input.otp,
      payee: input.payee,
      payment_method: input.paymentMethod,
      transaction_reference: input.reference,
      transaction_channel: input.channel,
      country_code: input.country,
    },
  });
}

export type MomoStatusResponse = {
  response_code: string;
  transaction_reference: string;
  transaction_amount: number;
  transaction_fee: number;
  transaction_status: string;
  payer_name?: string;
  payer_account_number?: string;
  currency: string;
};

export function momoStatus(reference: string, country: string, transactionId?: string) {
  const q = new URLSearchParams({ transaction_reference: reference, country_code: country });
  return payazaCall<MomoStatusResponse>({
    method: "GET",
    path: `/subsidiary/collections/v1/check-status?${q}`,
    product: true,
    transactionId,
  });
}

/** Sandbox only: plays the payer approving the prompt on their phone. */
export function fundTestCollection(reference: string, country: string, transactionId?: string) {
  return payazaCall<{ response_code: string; response_message: string }>({
    method: "POST",
    path: "/subsidiary/funding/v1/process-collection",
    product: true,
    transactionId,
    body: { transaction_reference: reference, country_code: country },
  });
}

export type VirtualAccountResponse = {
  success: boolean;
  message: string;
  data?: {
    account_name: string;
    account_number: string;
    account_type: string;
    bank_name: string;
    account_reference: string;
    transaction_reference?: string;
    transaction_amount_payable?: number;
    expires_in_minutes?: number;
  };
};

/** One-off NGN account that expires. Payaza reports the payment by webhook with our reference. */
export function createDynamicVirtualAccount(input: {
  reference: string;
  amount: number;
  accountName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  description: string;
  bankCode: string;
  expiresInMinutes: number;
  transactionId?: string;
}) {
  return payazaCall<VirtualAccountResponse>({
    method: "POST",
    path: "/merchant-collection/merchant/virtual_account/generate_virtual_account",
    tenant: false,
    transactionId: input.transactionId,
    body: {
      account_name: input.accountName,
      account_type: "Dynamic",
      bank_code: input.bankCode,
      // Required even though it is empty for dynamic accounts; without it Payaza
      // answers "Virtual account not generated".
      bvn: "",
      has_amount_validation: "true",
      account_reference: input.reference,
      customer_first_name: input.firstName,
      customer_last_name: input.lastName,
      customer_email: input.email,
      customer_phone_number: input.phone || "0000000000",
      transaction_description: input.description,
      transaction_amount: String(input.amount),
      expires_in_minutes: String(input.expiresInMinutes),
    },
  });
}

/** Sandbox only: plays a bank transfer into a test virtual account. */
export function fundTestVirtualAccount(input: {
  accountName: string;
  accountNumber: string;
  reference: string;
  amount: number;
  payerName: string;
  transactionId?: string;
}) {
  return payazaCall<{ success: boolean; message: string }>({
    method: "POST",
    path: "/merchant-collection/payaza/virtual_account/fund_test_virtual_account",
    tenant: false,
    transactionId: input.transactionId,
    body: {
      account_name: input.accountName,
      account_number: input.accountNumber,
      initiation_transaction_reference: input.reference,
      transaction_amount: String(input.amount),
      currency: "NGN",
      source_account_number: "0123456789",
      source_account_name: input.payerName,
      source_bank_name: "Test Bank",
    },
  });
}

export type MerchantReferenceStatus = {
  success: boolean;
  message: string;
  data?: {
    transaction_reference: string | null;
    amount_received: number;
    transaction_fee: number;
    transaction_status: string;
    sender_name: string | null;
    currency: string;
    merchant_transaction_reference: string;
    transaction_type: string;
    status_reason: string;
  } | null;
};

/** Status of a card, checkout or virtual account payment, by our reference. */
export function collectionStatusByMerchantReference(reference: string, transactionId?: string) {
  const q = new URLSearchParams({ merchant_reference: reference });
  return payazaCall<MerchantReferenceStatus>({
    method: "GET",
    path: `/merchant-collection/transfer_notification_controller/merchant/transaction-query?${q}`,
    tenant: false,
    transactionId,
  });
}

/** Status of a virtual account payment, by our reference. */
export function virtualAccountStatus(reference: string, transactionId?: string) {
  const q = new URLSearchParams({ transaction_reference: reference });
  return payazaCall<MerchantReferenceStatus>({
    method: "GET",
    path: `/merchant-collection/transfer_notification_controller/transaction-query?${q}`,
    tenant: false,
    transactionId,
  });
}

/** A collection's state as one shape, whichever Payaza endpoint answered. */
export type CollectionState = {
  state: "pending" | "success" | "failed" | "unknown";
  amount: number | null;
  fee: number | null;
  currency: string | null;
  payerName: string | null;
  raw: unknown;
};

function stateFromText(s: string | undefined): CollectionState["state"] {
  const t = (s ?? "").toLowerCase();
  if (t === "completed" || t === "funds received" || t === "successful") return "success";
  if (t === "failed" || t === "transaction failed" || t === "expired") return "failed";
  if (t === "initialized" || t === "pending" || t === "processing") return "pending";
  return "unknown";
}

/**
 * Ask Payaza what happened to a collection. Mobile money has its own status
 * endpoint; cards, checkout and virtual accounts share the merchant reference one.
 */
export async function collectionState(input: {
  reference: string;
  method: "momo" | "bank" | "card";
  currency: string;
  country: string;
  transactionId?: string;
}): Promise<CollectionState> {
  if (input.method === "momo" || input.currency === "ZAR") {
    const r = await momoStatus(input.reference, input.country, input.transactionId);
    const d = r.data;
    if (!d)
      return { state: "unknown", amount: null, fee: null, currency: null, payerName: null, raw: r };
    // A 96 with no transaction_status is Payaza rejecting our query (bad country
    // code, unknown reference), not the payer's payment failing. That is "unknown".
    const state: CollectionState["state"] = d.transaction_status
      ? stateFromText(d.transaction_status)
      : d.response_code === "00"
        ? "success"
        : d.response_code === "09"
          ? "pending"
          : "unknown";
    return {
      state,
      amount: d.transaction_amount ?? null,
      fee: d.transaction_fee ?? null,
      currency: d.currency ?? null,
      payerName: d.payer_name ?? null,
      raw: d,
    };
  }
  const r =
    input.method === "bank"
      ? await virtualAccountStatus(input.reference, input.transactionId)
      : await collectionStatusByMerchantReference(input.reference, input.transactionId);
  const d = r.data?.data;
  if (!d) {
    // "Transaction not found" before the payer has paid is normal for checkout.
    return {
      state: r.status === 400 ? "pending" : "unknown",
      amount: null,
      fee: null,
      currency: null,
      payerName: null,
      raw: r,
    };
  }
  return {
    state: stateFromText(d.transaction_status),
    amount: d.amount_received ?? null,
    fee: d.transaction_fee ?? null,
    currency: d.currency ?? null,
    payerName: d.sender_name ?? null,
    raw: d,
  };
}

/* --------------------------------- payouts -------------------------------- */

export type MainAccount = {
  payazaAccountReference: string;
  currency: string;
  country: string;
  accountBalance: number;
  status: string;
  postNoDebit: boolean;
};

/** Meridian's Payaza balances, one per currency. The reference goes into every Transfer. */
export async function mainAccounts(): Promise<MainAccount[]> {
  const r = await payazaCall<{ status: boolean; data?: MainAccount[] }>({
    method: "GET",
    path: "/payaza-account/api/v1/mainaccounts/merchant/enquiry/main",
  });
  return r.data?.data ?? [];
}

export type NameEnquiryResponse = {
  response_code: number;
  response_message: string;
  response_content?: {
    account_number: string;
    bank_code: string;
    account_name: string;
    account_status: string;
  };
};

export function accountNameEnquiry(input: {
  currency: string;
  bankCode: string;
  accountNumber: string;
}) {
  return payazaCall<NameEnquiryResponse>({
    method: "POST",
    path: "/payaza-account/api/v1/mainaccounts/merchant/provider/enquiry",
    body: {
      service_payload: {
        currency: input.currency,
        bank_code: input.bankCode,
        account_number: input.accountNumber,
      },
    },
  });
}

export type TransferResponse = {
  response_code: number;
  response_message: string;
  response_content?: {
    transaction_status?: string;
    response_status?: string;
    response_description?: string;
    amount?: number;
  };
  resp_code?: string;
};

export function initiateTransfer(input: {
  rail: string;
  amount: number;
  currency: string;
  /** ISO-3, e.g. KEN. */
  country: string;
  accountReference: string;
  pin: string;
  beneficiary: { accountNumber: string; accountName: string; bankCode: string };
  narration: string;
  reference: string;
  sender: { name: string; phone: string; address: string };
  transactionId?: string;
}) {
  return payazaCall<TransferResponse>({
    method: "POST",
    path: "/payout-receptor/payout",
    transactionId: input.transactionId,
    body: {
      transaction_type: input.rail,
      service_payload: {
        payout_amount: input.amount,
        transaction_pin: input.pin,
        account_reference: input.accountReference,
        currency: input.currency,
        country: input.country,
        payout_beneficiaries: [
          {
            credit_amount: input.amount,
            account_number: input.beneficiary.accountNumber,
            account_name: input.beneficiary.accountName,
            bank_code: input.beneficiary.bankCode,
            narration: input.narration,
            transaction_reference: input.reference,
            sender: {
              sender_name: input.sender.name,
              sender_id: "",
              sender_phone_number: input.sender.phone,
              sender_address: input.sender.address,
            },
          },
        ],
      },
    },
  });
}

export type TransferStatusResponse = {
  status: boolean;
  message: string;
  data?: {
    transactionReference: string;
    transactionAmount: number;
    fee: number;
    transactionStatus: string;
    responseMessage: string;
    currency: string;
  } | null;
};

export type TransferState = {
  state: "pending" | "success" | "failed" | "not_found" | "unknown";
  fee: number | null;
  message: string | null;
  raw: unknown;
};

export async function transferState(
  reference: string,
  transactionId?: string,
): Promise<TransferState> {
  const q = new URLSearchParams({ transaction_reference: reference });
  const r = await payazaCall<TransferStatusResponse>({
    method: "GET",
    path: `/payaza-account/api/v1/mainaccounts/transaction/status?${q}`,
    transactionId,
  });
  if (r.status === 404) return { state: "not_found", fee: null, message: null, raw: r };
  const d = r.data?.data;
  if (!d)
    return {
      state: r.data?.status === false ? "not_found" : "unknown",
      fee: null,
      message: r.data?.message ?? null,
      raw: r,
    };
  const s = d.transactionStatus;
  const state =
    s === "NIP_SUCCESS"
      ? "success"
      : s === "NIP_FAILURE"
        ? "failed"
        : s === "NIP_PENDING" || s === "TRANSACTION_INITIATED" || s === "ESCROW_SUCCESS"
          ? "pending"
          : "unknown";
  return { state, fee: d.fee ?? null, message: d.responseMessage ?? null, raw: d };
}
