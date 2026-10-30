import "server-only";
import { findNetwork } from "~/lib/countries";
import { kotaniNetwork } from "~/lib/partner-requests";
import { env } from "../env";
import { partnerFetch } from "./http";

// Checks a business's own payout account before we pay into it: that it exists,
// and whose name is on it. Kotani's validate calls do this for mobile money and
// for banks (docs/kotani pay openapi.json: POST /customer/validate/mobile-money
// and /customer/validate/bank). We pass the name we expect; Kotani returns the
// real one.

export type AccountCheck = {
  /** The name on the account, as the provider sees it. Null when it can't say. */
  resolvedName: string | null;
  /** False when the provider says the account is not real or not supported. */
  valid: boolean;
  /** Why not, in the provider's words. */
  message: string | null;
};

type ValidateReply = {
  success?: boolean;
  message?: string;
  data?: { isValid?: boolean; isSupported?: boolean; accountName?: string; message?: string };
};

export async function checkPayoutAccount(input: {
  method: "momo" | "bank";
  country: string;
  accountNumber: string;
  /** Network code for mobile money, bank code for a bank. */
  bankCode: string;
  expectedName: string;
}): Promise<AccountCheck> {
  const k = env.kotani;
  if (!k) return { resolvedName: null, valid: true, message: "No account checker is set up." };
  const body =
    input.method === "momo"
      ? {
          accountType: "mobile_money",
          phoneNumber: `+${input.accountNumber.replace(/^\+/, "")}`,
          network: kotaniNetwork(findNetwork(input.bankCode)?.name),
          accountName: input.expectedName,
        }
      : {
          accountNumber: input.accountNumber,
          bankCode: input.bankCode,
          countryCode: input.country,
          accountName: input.expectedName,
        };
  const r = await partnerFetch<ValidateReply>({
    partner: "kotani",
    method: "POST",
    url: `${k.baseUrl}/customer/validate/${input.method === "momo" ? "mobile-money" : "bank"}`,
    headers: { Authorization: `Bearer ${k.apiKey}` },
    body: JSON.stringify(body),
  });
  const d = r.data?.data;
  if (!r.ok || !d) {
    return {
      resolvedName: null,
      valid: false,
      message: r.data?.message ?? `The account check did not answer (HTTP ${r.status}).`,
    };
  }
  return {
    resolvedName: d.accountName ?? null,
    valid: d.isValid !== false && d.isSupported !== false,
    message: d.message ?? null,
  };
}
