// Labels and timeline steps for transaction and request statuses. Pure.

export type TransactionStatus =
  | "quoted"
  | "awaiting_payin"
  | "blocked"
  | "collected"
  | "held"
  | "paying_out"
  | "settled"
  | "failed"
  | "refunded";

export type RequestStatus = "active" | "paid" | "expired" | "disabled";

export const TRANSACTION_LABEL: Record<TransactionStatus, string> = {
  quoted: "Quoted",
  awaiting_payin: "Waiting for payment",
  blocked: "Blocked",
  collected: "Paid",
  held: "Under review",
  paying_out: "Paying out",
  settled: "Settled",
  failed: "Failed",
  refunded: "Refunded",
};

export const REQUEST_LABEL: Record<RequestStatus, string> = {
  active: "Open",
  paid: "Paid",
  expired: "Expired",
  disabled: "Disabled",
};

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const TRANSACTION_TONE: Record<TransactionStatus, Tone> = {
  quoted: "neutral",
  awaiting_payin: "info",
  blocked: "danger",
  collected: "info",
  held: "warning",
  paying_out: "info",
  settled: "success",
  failed: "danger",
  refunded: "neutral",
};

export const REQUEST_TONE: Record<RequestStatus, Tone> = {
  active: "info",
  paid: "success",
  expired: "neutral",
  disabled: "neutral",
};

/** Whether a status is final: nothing else will happen to this transaction. */
export function isTerminal(status: TransactionStatus): boolean {
  return (
    status === "settled" || status === "failed" || status === "blocked" || status === "refunded"
  );
}

/** The four steps a payer and a business watch. */
export const TIMELINE_STEPS = ["awaiting_payin", "collected", "paying_out", "settled"] as const;

/**
 * Which timeline step a status sits at, and whether the flow stopped there.
 * held sits at "collected" (paid, not paid out). failed stops wherever it was.
 */
export function timelinePosition(
  status: TransactionStatus,
  failedAt?: TransactionStatus | null,
): { step: number; stopped: boolean } {
  switch (status) {
    case "quoted":
    case "awaiting_payin":
      return { step: 0, stopped: false };
    case "blocked":
      return { step: 0, stopped: true };
    case "collected":
    case "held":
      return { step: 1, stopped: status === "held" };
    case "paying_out":
      return { step: 2, stopped: false };
    case "settled":
      return { step: 3, stopped: false };
    case "refunded":
      return { step: 1, stopped: true };
    case "failed": {
      const at = failedAt ? timelinePosition(failedAt).step : 0;
      return { step: at, stopped: true };
    }
  }
}
