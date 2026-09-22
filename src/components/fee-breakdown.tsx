import { formatMoney, type Currency, type Quote } from "@/lib/fees";

export function FeeRow({
  label,
  value,
  hint,
  emphasis,
  positive,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div>
        <p className={emphasis ? "text-sm font-semibold" : "text-sm text-muted-foreground"}>
          {label}
        </p>
        {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
      </div>
      <p
        className={
          emphasis
            ? "font-display text-base font-semibold"
            : positive
              ? "text-sm font-medium text-success"
              : "text-sm font-medium"
        }
      >
        {value}
      </p>
    </div>
  );
}

export function FeeBreakdown({
  quote,
  currencyCode,
  receiveCurrency,
  netLabel = "Recipient receives",
}: {
  quote: Quote;
  currencyCode: Currency;
  receiveCurrency?: Currency;
  netLabel?: string;
}) {
  const receive = receiveCurrency ?? currencyCode;
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Transparent cost breakdown
      </p>
      <div className="divide-y divide-border/70">
        <FeeRow label="Amount" value={formatMoney(quote.amount, currencyCode)} />
        <FeeRow
          label="Partner fee"
          hint="Charged by our licensed payment partner"
          value={formatMoney(quote.partnerFee, currencyCode)}
        />
        <FeeRow
          label="Meridian fee"
          hint="Flat 1%. No FX markup."
          value={formatMoney(quote.meridianFee, currencyCode)}
        />
        <FeeRow
          label={`Total cost (${(quote.effectiveRate * 100).toFixed(2)}%)`}
          value={formatMoney(quote.totalFee, currencyCode)}
          emphasis
        />
        <FeeRow label={netLabel} value={formatMoney(quote.recipientGets, receive)} emphasis />
        <FeeRow
          label="Typical bank route"
          hint="What the same transfer usually costs today"
          value={formatMoney(quote.traditionalFee, currencyCode)}
        />
        <FeeRow
          label="You keep"
          value={formatMoney(Math.max(quote.saving, 0), currencyCode)}
          positive
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Demo estimate. Real fees and the amount received are confirmed by our partner before you
        pay.
      </p>
    </div>
  );
}
