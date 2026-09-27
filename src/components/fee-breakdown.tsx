import { Show } from "solid-js";
import { formatMoney, type Currency, type Quote } from "~/lib/fees";

export function FeeRow(props: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  positive?: boolean;
}) {
  return (
    <div class="flex items-start justify-between gap-4 py-2.5">
      <div>
        <p class={props.emphasis ? "text-sm font-semibold" : "text-sm text-muted-foreground"}>
          {props.label}
        </p>
        <Show when={props.hint}>
          <p class="text-xs text-muted-foreground/80">{props.hint}</p>
        </Show>
      </div>
      <p
        class={
          props.emphasis
            ? "font-display text-base font-semibold"
            : props.positive
              ? "text-sm font-medium text-success"
              : "text-sm font-medium"
        }
      >
        {props.value}
      </p>
    </div>
  );
}

export function FeeBreakdown(props: {
  quote: Quote;
  currencyCode: Currency;
  receiveCurrency?: Currency;
  netLabel?: string;
  payLabel?: string;
}) {
  const receive = () => props.receiveCurrency ?? props.currencyCode;
  return (
    <div class="rounded-xl border border-border bg-surface/60 p-4">
      <p class="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Transparent cost breakdown
      </p>
      <div class="divide-y divide-border/70">
        <FeeRow label="Amount" value={formatMoney(props.quote.amount, props.currencyCode)} />
        <FeeRow
          label="Partner fee"
          hint="Charged by our licensed payment partner"
          value={formatMoney(props.quote.partnerFee, props.currencyCode)}
        />
        <FeeRow
          label="Meridian fee"
          hint="Flat 1%. No FX markup."
          value={formatMoney(props.quote.meridianFee, props.currencyCode)}
        />
        <FeeRow
          label={`Total cost (${(props.quote.effectiveRate * 100).toFixed(2)}%)`}
          value={formatMoney(props.quote.totalFee, props.currencyCode)}
          emphasis
        />
        <FeeRow
          label={props.payLabel ?? "You pay"}
          hint="Amount plus fees"
          value={formatMoney(props.quote.payerPays, props.currencyCode)}
          emphasis
        />
        <FeeRow
          label={props.netLabel ?? "Recipient receives"}
          value={formatMoney(props.quote.recipientGets, receive())}
          emphasis
        />
        <FeeRow
          label="Typical bank route"
          hint="What the same transfer usually costs today"
          value={formatMoney(props.quote.traditionalFee, props.currencyCode)}
        />
        <FeeRow
          label="You keep"
          value={formatMoney(Math.max(props.quote.saving, 0), props.currencyCode)}
          positive
        />
      </div>
      <p class="mt-3 text-xs text-muted-foreground">
        Demo estimate. Real fees and the amount received are confirmed by our partner before you
        pay.
      </p>
    </div>
  );
}
