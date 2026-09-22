import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Building2, CheckCircle2, CreditCard, Smartphone } from "lucide-react";

import { FeeBreakdown } from "@/components/fee-breakdown";
import { DemoBanner, SiteFooter, Wordmark } from "@/components/site-chrome";
import { supabase } from "@/integrations/supabase/client";
import { sendNotification } from "@/lib/notify.functions";
import {
  CURRENCIES,
  METHOD_LABEL,
  formatMoney,
  makeReference,
  quoteCollection,
  type Currency,
  type PayMethod,
} from "@/lib/fees";

export const Route = createFileRoute("/demo/checkout")({
  head: () => ({
    meta: [
      { title: "Demo checkout — Meridian" },
      {
        name: "description",
        content:
          "What your customer sees when they pay you through Meridian. Bank, mobile money or card. Fees shown first.",
      },
      { property: "og:title", content: "Demo checkout — Meridian" },
      {
        property: "og:description",
        content: "The Meridian checkout, with every fee shown before payment.",
      },
    ],
  }),
  component: CheckoutDemo,
});

const METHODS: { id: PayMethod; icon: typeof Building2; blurb: string }[] = [
  { id: "bank", icon: Building2, blurb: "Pay from any local bank account" },
  { id: "momo", icon: Smartphone, blurb: "M-Pesa, MoMo, Airtel Money" },
  { id: "card", icon: CreditCard, blurb: "Visa or Mastercard" },
];

function CheckoutDemo() {
  const notify = useServerFn(sendNotification);
  const [method, setMethod] = useState<PayMethod>("momo");
  const [currencyCode, setCurrencyCode] = useState<Currency>("KES");
  const [amount, setAmount] = useState(48500);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState<{ reference: string } | null>(null);

  const quote = quoteCollection(amount || 0, method);
  const merchant = "Ridgeway Hardware Ltd";

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const reference = makeReference();
    await supabase.from("demo_transactions").insert({
      kind: "checkout",
      reference,
      payer_name: name,
      payer_email: email,
      merchant,
      send_currency: currencyCode,
      receive_currency: currencyCode,
      amount,
      partner_fee: quote.partnerFee,
      meridian_fee: quote.meridianFee,
      total_fee: quote.totalFee,
      recipient_gets: quote.recipientGets,
    });
    await notify({
      data: {
        to: email,
        subject: `Payment confirmation ${reference} — ${merchant}`,
        heading: "Payment received",
        intro: `Demo receipt for your simulated payment to ${merchant}. In the live product this arrives seconds after the money lands.`,
        rows: [
          { label: "Reference", value: reference },
          { label: "Paid to", value: merchant },
          { label: "Amount", value: formatMoney(amount, currencyCode) },
          { label: "Method", value: METHOD_LABEL[method] },
          { label: "Total fees", value: formatMoney(quote.totalFee, currencyCode) },
          { label: "Merchant receives", value: formatMoney(quote.recipientGets, currencyCode) },
        ],
        footnote: "Demo only — no money was collected or moved.",
      },
    }).catch(() => undefined);
    setBusy(false);
    setPaid({ reference });
    toast.success("Demo payment complete — receipt emailed.");
  }

  return (
    <div className="min-h-screen">
      <DemoBanner>
        Demo checkout. This is what your customer sees. No money is collected.
      </DemoBanner>
      <DemoHeader />
      <main className="mx-auto max-w-5xl px-5 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Meridian
        </Link>

        {paid ? (
          <div className="panel mx-auto mt-8 max-w-lg p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <h1 className="mt-4 font-display text-2xl font-bold">Paid</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatMoney(amount, currencyCode)} paid to {merchant}. Receipt sent to {email}.
            </p>
            <p className="mt-4 font-mono text-sm text-primary">{paid.reference}</p>
            <button
              onClick={() => setPaid(null)}
              className="mt-6 rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-secondary"
            >
              Run the demo again
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <form onSubmit={pay} className="panel space-y-6 p-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Paying</p>
                <h1 className="font-display text-2xl font-bold">{merchant}</h1>
                <p className="text-sm text-muted-foreground">Invoice INV-2048 · Power tools</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-xs text-muted-foreground sm:col-span-1">
                  Currency
                  <select
                    value={currencyCode}
                    onChange={(e) => setCurrencyCode(e.target.value as Currency)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground sm:col-span-2">
                  Amount
                  <input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div>
                <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                  Payment method
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        method === m.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-secondary"
                      }`}
                    >
                      <m.icon className="h-4 w-4 text-primary" />
                      <p className="mt-2 text-sm font-semibold">{METHOD_LABEL[m.id]}</p>
                      <p className="text-xs text-muted-foreground">{m.blurb}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs text-muted-foreground">
                  Your name
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Email for receipt
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Processing…" : `Pay ${formatMoney(amount || 0, currencyCode)}`}
              </button>
              <p className="text-center text-xs text-muted-foreground">
                Simulated payment. Nothing is charged.
              </p>
            </form>

            <div className="space-y-4">
              <FeeBreakdown
                quote={quote}
                currencyCode={currencyCode}
                netLabel="Merchant receives"
              />
              <div className="panel p-5 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Why you see the fees</p>
                <p className="mt-2">
                  Meridian shows the partner fee and our 1% before anyone pays. No surprise
                  deductions when the money lands.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

export function DemoHeader() {
  return (
    <header className="border-b border-border/70 px-5 py-4">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Wordmark />
        <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
          Demo
        </span>
      </div>
    </header>
  );
}
