import Copy from "lucide-solid/icons/copy";
import { For, Match, Show, Switch } from "solid-js";

import { toast } from "~/components/ui/toast";
import { formatMoney } from "~/lib/fees";
import type { PayinInstructions } from "~/server/partners/adapters";
import type { PricedPlan } from "~/server/money/routed";

// Shared by /app/send and the pay page's "pay in another currency": the ranked
// provider prices, and the instructions a routed provider gives the payer.

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

export function countryName(code: string): string {
  return regionNames?.of(code) ?? code;
}

function copy(value: string, what: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${what} copied.`),
    () => toast.error(`Could not copy the ${what.toLowerCase()}.`),
  );
}

/**
 * Every provider that can carry the payment, cheapest first. The first is the
 * one used; the rest are backups, tried in order if it is down.
 */
export function RouteQuotes(props: { plan: PricedPlan; payerLabel?: string }) {
  return (
    <div class="space-y-2" data-testid="route-quotes">
      <ol class="space-y-2">
        <For each={props.plan.quotes}>
          {(q, i) => (
            <li
              data-testid="route-quote"
              data-provider={q.provider}
              class={`rounded-xl border px-4 py-3 text-sm ${i() === 0 ? "border-primary/60 bg-primary/5" : "border-border"}`}
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="font-semibold">{q.providerName}</span>
                  <span
                    class={`rounded-full px-2 py-0.5 text-xs font-semibold ${i() === 0 ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}
                  >
                    {i() === 0 ? "Cheapest" : `Backup ${i()}`}
                  </span>
                  <Show when={q.estimated}>
                    <span
                      class="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning"
                      title="No live price from this provider yet. Based on its published fees."
                    >
                      Estimate
                    </span>
                  </Show>
                  <Show when={q.basis === "assumed"}>
                    <span
                      class="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
                      title="The provider's docs imply this route but don't list it exactly. To confirm with them."
                    >
                      Route to confirm
                    </span>
                  </Show>
                </div>
                <span class="font-display text-base font-semibold">
                  {formatMoney(q.price.total, q.sendCurrency)}
                </span>
              </div>
              <p class="mt-1 text-xs text-muted-foreground">
                {props.payerLabel ?? "You pay"} {formatMoney(q.price.total, q.sendCurrency)}.{" "}
                {formatMoney(q.receiveAmount, q.receiveCurrency)} arrives. Provider cost{" "}
                {formatMoney(q.price.providerFee, q.sendCurrency)} (fees and exchange rate),
                Meridian {formatMoney(q.price.meridianFee, q.sendCurrency)}.
              </p>
            </li>
          )}
        </For>
      </ol>
      <Show when={props.plan.unavailable.length > 0}>
        <p class="text-xs text-muted-foreground">
          Not available for this payment:{" "}
          {props.plan.unavailable.map((u) => `${u.providerName} (${u.reason})`).join(", ")}.
        </p>
      </Show>
    </div>
  );
}

/** Which providers were tried before the one carrying the payment. */
export function FallbackNote(props: {
  attempts: { provider: string; providerName?: string; ok: boolean; error?: string }[];
}) {
  const failed = () => props.attempts.filter((a) => !a.ok);
  return (
    <Show when={failed().length > 0}>
      <div
        class="rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-xs"
        data-testid="fallback-note"
      >
        <For each={failed()}>
          {(a) => (
            <p>
              {a.providerName ?? a.provider} was unavailable ({a.error ?? "failed"}), so the next
              cheapest took over.
            </p>
          )}
        </For>
      </div>
    </Show>
  );
}

function Row(props: { label: string; value: string; copyable?: boolean; mono?: boolean }) {
  return (
    <div class="flex items-center justify-between gap-3 py-2">
      <span class="text-xs text-muted-foreground">{props.label}</span>
      <span class={`flex items-center gap-2 text-right text-sm ${props.mono ? "font-mono" : ""}`}>
        {props.value}
        <Show when={props.copyable}>
          <button
            type="button"
            onClick={() => copy(props.value, props.label)}
            aria-label={`Copy ${props.label.toLowerCase()}`}
            class="rounded-md p-1 text-primary hover:bg-primary/10"
          >
            <Copy class="h-4 w-4" />
          </button>
        </Show>
      </span>
    </div>
  );
}

/** What to send, where: a bank account abroad, a USDC address, or a wallet prompt. */
export function RoutedPayinBox(props: { payin: PayinInstructions; providerName: string | null }) {
  const total = () =>
    formatMoney(props.payin.amount, "currency" in props.payin ? props.payin.currency : "USD");
  return (
    <div class="overflow-hidden rounded-xl border border-border" data-testid="routed-payin">
      <div class="bg-primary/10 p-4 text-center">
        <p class="text-xs text-muted-foreground">Send exactly</p>
        <p class="mt-1 font-display text-xl font-semibold">
          <Switch fallback={total()}>
            <Match when={props.payin.kind === "stablecoin"}>
              {props.payin.amount.toFixed(2)} USDC
            </Match>
          </Switch>
        </p>
        <Show when={props.providerName}>
          <p class="mt-1 text-xs text-muted-foreground">Carried by {props.providerName}</p>
        </Show>
      </div>
      <div class="divide-y divide-border bg-surface/60 px-4 py-2">
        <Switch>
          <Match when={props.payin.kind === "bank_transfer" && props.payin}>
            {(p) => (
              <>
                <Row label="Pay by" value={p().scheme} />
                <Row label="Bank" value={p().bankName} />
                <Row label="Account name" value={p().accountName} />
                <Row label="Account / IBAN" value={p().accountNumber} copyable mono />
                <Show when={p().routingCode}>
                  <Row label="Routing number" value={p().routingCode!} copyable mono />
                </Show>
                <Row label="Reference" value={p().reference} copyable mono />
              </>
            )}
          </Match>
          <Match when={props.payin.kind === "stablecoin" && props.payin}>
            {(p) => (
              <>
                <Row label="Token" value={`${p().token} on ${p().network}`} />
                <Row label="Address" value={p().address} copyable mono />
                <Show when={p().expiresAt}>
                  <Row label="Send before" value={new Date(p().expiresAt!).toLocaleTimeString()} />
                </Show>
              </>
            )}
          </Match>
          <Match when={props.payin.kind === "momo_prompt" && props.payin}>
            <p class="py-2 text-sm">Approve the prompt on your phone to pay.</p>
          </Match>
        </Switch>
        <Show when={props.payin.simulated}>
          <p class="py-2 text-xs text-warning">
            Sandbox details. Don't send real money; use the button below to play the payment.
          </p>
        </Show>
      </div>
    </div>
  );
}
