import { Title } from "@solidjs/meta";
import { A, createAsync, query, revalidate, type RouteDefinition } from "@solidjs/router";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import { For, Show, Suspense, createSignal } from "solid-js";

import { Badge, TransactionBadge } from "~/components/status";
import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY } from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { formatMoney, isCurrency, type Currency } from "~/lib/fees";
import {
  actOnFlag,
  actOnTransaction,
  listAdminFlags,
  listAdminTransactions,
  runRetryNow,
} from "~/server/admin-actions";

const loadTransactions = query(
  (filter: "all" | "attention") => listAdminTransactions(filter),
  "admin-transactions",
);
const loadFlags = query(() => listAdminFlags("open"), "admin-flags");

export const route = {
  preload: () => {
    void loadTransactions("all");
    void loadFlags();
  },
} satisfies RouteDefinition;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
const money = (a: number | string, c: string) =>
  isCurrency(c) ? formatMoney(Number(a), c as Currency) : `${c} ${a}`;

export default function AdminHome() {
  const [filter, setFilter] = createSignal<"all" | "attention">("all");
  const txs = createAsync(() => loadTransactions(filter()));
  const flags = createAsync(() => loadFlags());
  const [busy, setBusy] = createSignal<string | null>(null);

  async function refresh() {
    await revalidate(["admin-transactions", "admin-flags"]);
  }

  async function onTx(id: string, action: "release" | "reject" | "retry_payout" | "mark_refunded") {
    const note =
      action === "release" || action === "reject"
        ? (prompt("Note for the record (optional)") ?? "")
        : "";
    setBusy(id);
    try {
      const r = await actOnTransaction({ transaction_id: id, action, note });
      if (!r.ok) return toast.error(r.error);
      toast.success("Done.");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onFlag(id: string, action: "clear" | "escalate") {
    setBusy(id);
    try {
      const r = await actOnFlag({ flag_id: id, action });
      if (!r.ok) return toast.error(r.error);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function sweep() {
    setBusy("sweep");
    try {
      const r = await runRetryNow();
      if (r.ok) toast.success(`Sweep: ${r.summary}`);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <main class="mx-auto max-w-6xl px-5 py-10">
      <Title>Admin — Meridian</Title>
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="font-display text-3xl font-bold">Payments and payouts</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            Held payments wait here. Failed payouts can be retried or marked refunded.
          </p>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            onClick={sweep}
            disabled={busy() === "sweep"}
            class={BUTTON_SECONDARY}
          >
            <RefreshCw class="h-4 w-4" /> Run payout sweep
          </button>
        </div>
      </div>

      <Suspense fallback={<p class="mt-8 text-sm text-muted-foreground">Loading…</p>}>
        <section class="mt-8">
          <h2 class="font-semibold">Open flags ({flags()?.length ?? 0})</h2>
          <div class="mt-3 space-y-2">
            <For
              each={flags()}
              fallback={<p class="text-sm text-muted-foreground">No open flags.</p>}
            >
              {(f) => (
                <div class="panel flex flex-wrap items-center justify-between gap-3 p-4">
                  <div class="text-sm">
                    <Badge
                      tone={
                        f.severity === "high"
                          ? "danger"
                          : f.severity === "medium"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {f.severity}
                    </Badge>{" "}
                    <span class="font-semibold">{f.rule}</span> · {f.businesses?.name}
                    <Show when={f.transactions}>
                      {" "}
                      · <span class="font-mono text-primary">{f.transactions!.reference}</span> (
                      {f.transactions!.status})
                    </Show>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {String((f.evidence as Record<string, unknown>)["message"] ?? "")} · action{" "}
                      {f.action_taken} · {when(f.created_at)}
                    </p>
                  </div>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onFlag(f.id, "clear")}
                      disabled={busy() === f.id}
                      class={BUTTON_SECONDARY}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => onFlag(f.id, "escalate")}
                      disabled={busy() === f.id}
                      class={BUTTON_DANGER}
                    >
                      Escalate
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </section>

        <section class="mt-10">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">Transactions</h2>
            <div class="flex gap-1 text-sm">
              <button
                type="button"
                onClick={() => setFilter("all")}
                class={`rounded-full px-3 py-1 ${filter() === "all" ? "bg-secondary" : "text-muted-foreground"}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilter("attention")}
                class={`rounded-full px-3 py-1 ${filter() === "attention" ? "bg-secondary" : "text-muted-foreground"}`}
              >
                Needs attention
              </button>
            </div>
          </div>
          <div class="panel mt-3 overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr class="border-b border-border">
                  <th class="px-4 py-3">When</th>
                  <th class="px-4 py-3">Business</th>
                  <th class="px-4 py-3">Reference</th>
                  <th class="px-4 py-3 text-right">Amount</th>
                  <th class="px-4 py-3">Status</th>
                  <th class="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={txs()}
                  fallback={
                    <tr>
                      <td colspan={6} class="px-4 py-8 text-center text-muted-foreground">
                        Nothing here.
                      </td>
                    </tr>
                  }
                >
                  {(t) => (
                    <tr class="border-b border-border/60 last:border-0">
                      <td class="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {when(t.created_at)}
                      </td>
                      <td class="px-4 py-3">{t.businesses?.name}</td>
                      <td class="px-4 py-3">
                        <A
                          href={`/admin/transactions/${t.id}`}
                          class="font-mono text-primary hover:underline"
                        >
                          {t.reference}
                        </A>
                        <Show when={t.payment_requests?.invoice_number}>
                          <span class="ml-2 text-xs text-muted-foreground">
                            {t.payment_requests!.invoice_number}
                          </span>
                        </Show>
                      </td>
                      <td class="whitespace-nowrap px-4 py-3 text-right">
                        {money(t.send_amount, t.send_currency)}
                        <span class="block text-xs text-muted-foreground">
                          charged {money(t.total_charged, t.send_currency)}
                        </span>
                      </td>
                      <td class="px-4 py-3">
                        <TransactionBadge status={t.status} />
                        <Show when={t.failure_reason}>
                          <p class="mt-1 max-w-xs text-xs text-muted-foreground">
                            {t.failure_reason}
                          </p>
                        </Show>
                      </td>
                      <td class="px-4 py-3">
                        <div class="flex flex-wrap gap-1">
                          <Show when={t.status === "held"}>
                            <button
                              type="button"
                              onClick={() => onTx(t.id, "release")}
                              disabled={busy() === t.id}
                              class={BUTTON_PRIMARY}
                            >
                              Release
                            </button>
                            <button
                              type="button"
                              onClick={() => onTx(t.id, "reject")}
                              disabled={busy() === t.id}
                              class={BUTTON_DANGER}
                            >
                              Reject
                            </button>
                          </Show>
                          <Show when={t.status === "failed" && t.collected_at}>
                            <button
                              type="button"
                              onClick={() => onTx(t.id, "retry_payout")}
                              disabled={busy() === t.id}
                              class={BUTTON_SECONDARY}
                            >
                              Retry payout
                            </button>
                            <button
                              type="button"
                              onClick={() => onTx(t.id, "mark_refunded")}
                              disabled={busy() === t.id}
                              class={BUTTON_SECONDARY}
                            >
                              Mark refunded
                            </button>
                          </Show>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>
      </Suspense>
    </main>
  );
}
