"use server";

import type { Tables } from "~/lib/database.types";
import { adminFlagActionSchema, adminTransactionActionSchema } from "~/lib/schemas";
import { currentViewer } from "./auth";
import {
  CollectError,
  adminMarkRefunded,
  adminReject,
  adminRelease,
  adminRetryPayout,
  runPayoutRetry,
} from "./money/collect";
import { supabaseAdmin } from "./supabase";

// Server functions for /admin. Every one checks the admin claim first.

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const db = () => supabaseAdmin();

async function requireAdmin() {
  const viewer = await currentViewer();
  if (!viewer?.isAdmin) throw new Error("Not an admin");
  return viewer;
}

export type AdminTransaction = Tables<"transactions"> & {
  businesses: { name: string } | null;
  payment_requests: { reference: string; invoice_number: string | null } | null;
};

export type AdminFlag = Tables<"aml_flags"> & {
  businesses: { name: string } | null;
  transactions: { reference: string; status: string } | null;
};

export async function listAdminTransactions(
  filter: "all" | "attention" = "all",
): Promise<AdminTransaction[]> {
  await requireAdmin();
  let q = db()
    .from("transactions")
    .select("*, businesses(name), payment_requests(reference, invoice_number)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter === "attention") q = q.in("status", ["held", "failed", "paying_out", "collected"]);
  const { data } = await q;
  return (data ?? []) as unknown as AdminTransaction[];
}

export async function listAdminFlags(status: "open" | "all" = "open"): Promise<AdminFlag[]> {
  await requireAdmin();
  let q = db()
    .from("aml_flags")
    .select("*, businesses(name), transactions(reference, status)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "open") q = q.eq("status", "open");
  const { data } = await q;
  return (data ?? []) as unknown as AdminFlag[];
}

export async function actOnFlag(input: {
  flag_id: string;
  action: "clear" | "escalate";
  note?: string;
}): Promise<ActionResult> {
  const parsed = adminFlagActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid action." };
  const admin = await requireAdmin();
  const { error } = await db()
    .from("aml_flags")
    .update({
      status: parsed.data.action === "clear" ? "cleared" : "escalated",
      resolved_by: admin.id,
      resolved_at: new Date().toISOString(),
      note: parsed.data.note || null,
    })
    .eq("id", parsed.data.flag_id)
    .eq("status", "open");
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function actOnTransaction(input: {
  transaction_id: string;
  action: "release" | "reject" | "retry_payout" | "mark_refunded";
  note?: string;
}): Promise<ActionResult> {
  const parsed = adminTransactionActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid action." };
  const admin = await requireAdmin();
  const { data: tx } = await db()
    .from("transactions")
    .select()
    .eq("id", parsed.data.transaction_id)
    .maybeSingle();
  if (!tx) return { ok: false, error: "Transaction not found." };
  try {
    switch (parsed.data.action) {
      case "release":
        await adminRelease(tx, admin.id, parsed.data.note);
        break;
      case "reject":
        await adminReject(tx, admin.id, parsed.data.note);
        break;
      case "retry_payout":
        await adminRetryPayout(tx, admin.id);
        break;
      case "mark_refunded":
        await adminMarkRefunded(tx, admin.id, parsed.data.note);
        break;
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof CollectError) return { ok: false, error: e.message };
    console.error("[admin] action failed", e);
    return { ok: false, error: "The action failed. Check the logs." };
  }
}

/** Runs the payout retry sweep now, without waiting for the cron. */
export async function runRetryNow(): Promise<ActionResult<{ summary: string }>> {
  await requireAdmin();
  const r = await runPayoutRetry();
  return {
    ok: true,
    summary: `started ${r.started}, resumed ${r.resumed}, checked ${r.checked}, reconciled ${r.reconciled}`,
  };
}

export async function getAdminTransaction(id: string): Promise<{
  tx: AdminTransaction;
  events: Tables<"transaction_events">[];
  flags: Tables<"aml_flags">[];
  calls: Tables<"partner_calls">[];
} | null> {
  await requireAdmin();
  const { data: tx } = await db()
    .from("transactions")
    .select("*, businesses(name), payment_requests(reference, invoice_number)")
    .eq("id", id)
    .maybeSingle();
  if (!tx) return null;
  const [{ data: events }, { data: flags }, { data: calls }] = await Promise.all([
    db().from("transaction_events").select().eq("transaction_id", id).order("created_at"),
    db().from("aml_flags").select().eq("transaction_id", id).order("created_at"),
    db().from("partner_calls").select().eq("transaction_id", id).order("created_at"),
  ]);
  return {
    tx: tx as unknown as AdminTransaction,
    events: events ?? [],
    flags: flags ?? [],
    calls: calls ?? [],
  };
}
