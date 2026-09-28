import ChevronDown from "lucide-solid/icons/chevron-down";
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

/**
 * One line with the total cost and what the payer pays. "See breakdown" toggles
 * the full breakdown, which the page renders wherever it wants it.
 */
export function FeeSummary(props: {
  quote: Quote;
  currencyCode: Currency;
  note?: string;
  open: boolean;
  onToggle: () => void;
  /** Id of the breakdown element. On one-column (mobile) layouts, opening scrolls to it. */
  breakdownId?: string;
}) {
  function toggle() {
    const opening = !props.open;
    props.onToggle();
    const id = props.breakdownId;
    // Below the lg breakpoint the breakdown sits under the form, out of view.
    if (!opening || !id || !window.matchMedia("(max-width: 1023px)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() =>
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }),
    );
  }

  return (
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-border bg-surface/60 px-4 py-3 text-sm">
      <p class="text-muted-foreground">
        Total fees{" "}
        <span class="font-medium text-foreground">
          {formatMoney(props.quote.totalFee, props.currencyCode)}
        </span>{" "}
        · You pay{" "}
        <span class="font-display font-semibold text-foreground">
          {formatMoney(props.quote.payerPays, props.currencyCode)}
        </span>
      </p>
      <button
        type="button"
        aria-expanded={props.open}
        onClick={toggle}
        class="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        {props.open ? "Hide breakdown" : "See breakdown"}
        <ChevronDown class={`h-3.5 w-3.5 transition-transform ${props.open ? "rotate-180" : ""}`} />
      </button>
      <Show when={props.note}>
        <p class="w-full text-xs text-primary">{props.note}</p>
      </Show>
    </div>
  );
}

/** Short card explaining why every fee is shown up front. */
export function WhyFeesCard() {
  return (
    <div class="panel p-5 text-sm text-muted-foreground">
      <p class="font-semibold text-foreground">Why you see the fees</p>
      <p class="mt-2">
        Meridian shows the partner fee and our 1% before anyone pays. No surprise deductions when
        the money lands.
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
  /** Shown above the fee lines, e.g. when the fees are for a default method. */
  note?: string;
  id?: string;
}) {
  const receive = () => props.receiveCurrency ?? props.currencyCode;
  return (
    <div id={props.id} class="scroll-mt-20 rounded-xl border border-border bg-surface/60 p-4">
      <p class="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Transparent cost breakdown
      </p>
      <Show when={props.note}>
        <p class="mb-1 text-xs text-primary">{props.note}</p>
      </Show>
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
