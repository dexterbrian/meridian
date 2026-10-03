import Globe from "lucide-solid/icons/globe";
import { For, Show, createEffect, createResource, createSignal, on } from "solid-js";

import { RouteQuotes, countryName } from "~/components/routing";
import { BUTTON_PRIMARY, INPUT_CLASS, Notice, SELECT_CLASS } from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { formatMoney } from "~/lib/fees";
import { RAIL_LABEL, type PayerOption } from "~/lib/providers";
import type { PricedPlan } from "~/server/money/routed";
import {
  getOtherWaysToPay,
  quoteOtherCurrency,
  startOtherCurrencyPayment,
} from "~/server/pay-actions";

// A payer abroad, or in another African currency, pays a request. The business
// still gets the exact request amount in its own currency; the cheapest provider
// that can carry it does the conversion, with the others as backups.

// prettier-ignore
const PAYER_COUNTRIES = [
  "US", "GB", "DE", "FR", "NL", "BE", "IT", "ES", "IE", "AE", "SA", "JP", "CN", "HK", "IN",
  "KE", "NG", "GH", "ZA", "UG", "TZ", "RW", "ZM", "CM", "CI", "SN", "BJ", "SS", "ET",
];

const DEFAULT_COUNTRY: Record<string, string> = { USD: "US", EUR: "DE", GBP: "GB" };

const key = (o: PayerOption) => `${o.currency}|${o.rail}`;

export function OtherCurrencyPay(props: {
  reference: string;
  businessName: string;
  amount: string;
  disabled: boolean;
  onStarted: (transactionId: string) => void;
}) {
  const [options] = createResource(() => props.reference, getOtherWaysToPay);
  const [picked, setPicked] = createSignal("");
  const [plan, setPlan] = createSignal<PricedPlan | null>(null);
  const [quoting, setQuoting] = createSignal(false);
  const [quoteError, setQuoteError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [country, setCountry] = createSignal("");

  const option = () => (options() ?? []).find((o) => key(o) === picked()) ?? null;
  const payerCountry = () =>
    country() || option()?.country || DEFAULT_COUNTRY[option()?.currency ?? ""] || "US";

  createEffect(
    on(option, async (o) => {
      setPlan(null);
      setQuoteError("");
      if (!o) return;
      setQuoting(true);
      const r = await quoteOtherCurrency({
        reference: props.reference,
        currency: o.currency,
        rail: o.rail,
        country: o.country,
      });
      setQuoting(false);
      if (!r.ok) setQuoteError(r.error);
      else if (r.plan.quotes.length === 0)
        setQuoteError(`No provider can take ${o.currency} for this payment right now.`);
      else setPlan(r.plan);
    }),
  );

  async function onSubmit(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault();
    const o = option();
    if (!o) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await startOtherCurrencyPayment({
        reference: props.reference,
        currency: o.currency,
        rail: o.rail,
        payer_name: String(fd.get("payer_name") ?? ""),
        payer_email: String(fd.get("payer_email") ?? ""),
        payer_phone: String(fd.get("payer_phone") ?? ""),
        payer_country: payerCountry(),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      props.onStarted(r.transactionId);
    } catch {
      toast.error("We could not start this payment. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const top = () => plan()?.quotes[0] ?? null;

  return (
    <form onSubmit={onSubmit} class="space-y-4" data-testid="other-currency">
      <div class="flex items-start gap-2 text-sm">
        <Globe class="mt-0.5 h-4 w-4 text-primary" />
        <p>
          Pay in your own currency. {props.businessName} still receives exactly {props.amount}. We
          compare providers and use the cheapest.
        </p>
      </div>
      <select
        aria-label="Currency and way to pay"
        class={SELECT_CLASS}
        value={picked()}
        onChange={(e) => setPicked(e.currentTarget.value)}
      >
        <option value="">Choose your currency and how you'll pay</option>
        <For each={options() ?? []}>
          {(o) => (
            <option value={key(o)}>
              {o.currency} · {RAIL_LABEL[o.rail]}
              {o.country && !["USD", "EUR", "GBP"].includes(o.currency)
                ? ` (${countryName(o.country)})`
                : ""}
            </option>
          )}
        </For>
      </select>
      <p class="text-xs text-muted-foreground">
        Paying from Japan or China? No provider collects yen or yuan yet. Pay in USD by
        international bank transfer, or in USDC.
      </p>

      <Show when={quoting()}>
        <p class="text-sm text-muted-foreground">Asking providers for a price…</p>
      </Show>
      <Show when={quoteError()}>
        <Notice tone="warning">{quoteError()}</Notice>
      </Show>
      <Show when={plan()}>{(p) => <RouteQuotes plan={p()} />}</Show>

      <Show when={top()}>
        <div class="grid gap-3 sm:grid-cols-2">
          <input
            name="payer_name"
            aria-label="Your name"
            class={INPUT_CLASS}
            placeholder="Your full name"
            required
          />
          <input
            name="payer_email"
            type="email"
            aria-label="Email"
            class={INPUT_CLASS}
            placeholder="Email for the receipt"
            required
          />
          <select
            aria-label="Your country"
            class={SELECT_CLASS}
            value={payerCountry()}
            onChange={(e) => setCountry(e.currentTarget.value)}
          >
            <For each={PAYER_COUNTRIES}>{(c) => <option value={c}>{countryName(c)}</option>}</For>
          </select>
          <Show when={option()?.rail === "momo"}>
            <input
              name="payer_phone"
              aria-label="Phone"
              class={INPUT_CLASS}
              placeholder="Mobile money number"
            />
          </Show>
        </div>
        <button
          type="submit"
          disabled={busy() || props.disabled}
          class={`${BUTTON_PRIMARY} w-full py-3`}
        >
          {busy()
            ? "Starting…"
            : `Pay ${formatMoney(top()!.price.total, top()!.sendCurrency)} with ${top()!.providerName}`}
        </button>
      </Show>
    </form>
  );
}
