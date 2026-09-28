import { Title } from "@solidjs/meta";
import { A, createAsync, query, useSearchParams, type RouteDefinition } from "@solidjs/router";
import Download from "lucide-solid/icons/download";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import { For, Show, Suspense, createSignal } from "solid-js";

import { RequestBadge, TransactionBadge } from "~/components/status";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT_CLASS, Notice } from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { formatMoney, isCurrency, type Currency } from "~/lib/fees";
import { exportPaymentsCsv, getDashboard } from "~/server/business-actions";

const loadDashboard = query((search: string) => getDashboard(search), "dashboard");

export const route = {
  preload: ({ location }) => loadDashboard(new URLSearchParams(location.search).get("q") ?? ""),
} satisfies RouteDefinition;

function money(amount: number | string | null, code: string) {
  if (amount === null || !isCurrency(code)) return "—";
  return formatMoney(Number(amount), code as Currency);
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export default function Dashboard() {
  const [params, setParams] = useSearchParams<{ q?: string }>();
  const data = createAsync(() => loadDashboard(params.q ?? ""));
  const [exporting, setExporting] = createSignal(false);

  function search(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault();
    setParams({ q: String(new FormData(e.currentTarget).get("q") ?? "") || undefined });
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const r = await exportPaymentsCsv();
      if (!r.ok) return toast.error(r.error);
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  }

  return (
    <main class="mx-auto max-w-6xl px-5 py-10">
      <Title>Payments — Meridian</Title>
      <Suspense fallback={<p class="text-sm text-muted-foreground">Loading…</p>}>
        <Show when={data()}>
          {(d) => (
            <Show
              when={d().business}
              fallback={
                <div class="panel mx-auto max-w-xl p-8 text-center">
                  <h1 class="font-display text-2xl font-bold">Welcome to Meridian</h1>
                  <p class="mt-2 text-sm text-muted-foreground">
                    Two steps and you can send your first payment link: tell us about your business,
                    then add the account you want to be paid into.
                  </p>
                  <A href="/app/onboarding" class={`${BUTTON_PRIMARY} mt-6`}>
                    Set up your business
                  </A>
                </div>
              }
            >
              {(biz) => (
                <>
                  <div class="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p class="text-xs uppercase tracking-widest text-muted-foreground">
                        {biz().trading_name || biz().name}
                      </p>
                      <h1 class="mt-1 font-display text-3xl font-bold">Payments</h1>
                    </div>
                    <div class="flex gap-2">
                      <button
                        type="button"
                        onClick={exportCsv}
                        disabled={exporting()}
                        class={BUTTON_SECONDARY}
                      >
                        <Download class="h-4 w-4" /> Export CSV
                      </button>
                      <A href="/app/collect/new" class={BUTTON_PRIMARY}>
                        <Plus class="h-4 w-4" /> New request
                      </A>
                    </div>
                  </div>

                  <Show when={d().payoutAccounts.length === 0}>
                    <div class="mt-6">
                      <Notice tone="warning">
                        You have no payout account yet, so payers cannot pay you.{" "}
                        <A href="/app/settings/payout-accounts" class="font-semibold underline">
                          Add one now
                        </A>
                        .
                      </Notice>
                    </div>
                  </Show>

                  <div class="mt-8 grid gap-4 sm:grid-cols-3">
                    <div class="panel p-5">
                      <p class="text-xs text-muted-foreground">Open requests</p>
                      <p class="mt-1 font-display text-2xl font-semibold">{d().totals.openCount}</p>
                    </div>
                    <div class="panel p-5">
                      <p class="text-xs text-muted-foreground">Payments settled</p>
                      <p class="mt-1 font-display text-2xl font-semibold">
                        {d().totals.settledCount}
                      </p>
                    </div>
                    <div class="panel p-5">
                      <p class="text-xs text-muted-foreground">Received</p>
                      <Show
                        when={Object.keys(d().totals.settledByCurrency).length}
                        fallback={<p class="mt-1 font-display text-2xl font-semibold">—</p>}
                      >
                        <For each={Object.entries(d().totals.settledByCurrency)}>
                          {([code, amount]) => (
                            <p class="mt-1 font-display text-xl font-semibold">
                              {money(amount, code)}
                            </p>
                          )}
                        </For>
                      </Show>
                    </div>
                  </div>

                  <form onSubmit={search} class="mt-8 flex gap-2">
                    <label for="q" class="sr-only">
                      Search by invoice number or Meridian reference
                    </label>
                    <input
                      id="q"
                      name="q"
                      value={params.q ?? ""}
                      placeholder="Search by invoice number or Meridian reference"
                      class={INPUT_CLASS}
                    />
                    <button type="submit" class={BUTTON_SECONDARY} aria-label="Search">
                      <Search class="h-4 w-4" />
                    </button>
                  </form>

                  <div class="panel mt-4 overflow-x-auto">
                    <table class="w-full text-sm">
                      <thead class="text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <tr class="border-b border-border">
                          <th class="px-4 py-3">Created</th>
                          <th class="px-4 py-3">Invoice</th>
                          <th class="px-4 py-3">Reference</th>
                          <th class="px-4 py-3 text-right">Amount</th>
                          <th class="px-4 py-3">Link</th>
                          <th class="px-4 py-3">Paid by</th>
                          <th class="px-4 py-3">Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For
                          each={d().requests}
                          fallback={
                            <tr>
                              <td colspan={7} class="px-4 py-10 text-center text-muted-foreground">
                                {params.q
                                  ? "Nothing matches that search."
                                  : "No payment requests yet."}
                              </td>
                            </tr>
                          }
                        >
                          {(r) => (
                            <tr class="border-b border-border/60 last:border-0 hover:bg-secondary/40">
                              <td class="whitespace-nowrap px-4 py-3 text-muted-foreground">
                                {when(r.created_at)}
                              </td>
                              <td class="px-4 py-3">{r.invoice_number ?? "—"}</td>
                              <td class="px-4 py-3">
                                <A
                                  href={`/app/collect/${r.reference}`}
                                  class="font-mono text-primary hover:underline"
                                >
                                  {r.reference}
                                </A>
                              </td>
                              <td class="whitespace-nowrap px-4 py-3 text-right font-medium">
                                {money(r.amount, r.currency)}
                              </td>
                              <td class="px-4 py-3">
                                <RequestBadge status={r.status} />
                                <Show when={r.usage === "multi"}>
                                  <span class="ml-1 text-xs text-muted-foreground">
                                    ×{r.paid_count}
                                  </span>
                                </Show>
                              </td>
                              <td class="px-4 py-3">{r.latest?.payer_name ?? "—"}</td>
                              <td class="px-4 py-3">
                                <Show
                                  when={r.latest}
                                  fallback={<span class="text-muted-foreground">—</span>}
                                >
                                  {(l) => <TransactionBadge status={l().status} />}
                                </Show>
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Show>
          )}
        </Show>
      </Suspense>
    </main>
  );
}
