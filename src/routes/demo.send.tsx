import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

import { FeeBreakdown } from "@/components/fee-breakdown";
import { DemoBanner, SiteFooter, Wordmark } from "@/components/site-chrome";
import { supabase } from "@/integrations/supabase/client";
import { sendNotification } from "@/lib/notify.functions";
import {
  CURRENCIES,
  METHOD_LABEL,
  formatMoney,
  makeReference,
  quoteCrossBorder,
  type Currency,
  type PayMethod,
} from "@/lib/fees";

export const Route = createFileRoute("/demo/send")({
  head: () => ({
    meta: [
      { title: "Demo cross-border send — Meridian" },
      {
        name: "description",
        content:
          "Simulate paying a supplier in another African market with Meridian: live conversion, transparent fees and minutes-not-days settlement.",
      },
      { property: "og:title", content: "Demo cross-border send — Meridian" },
      {
        property: "og:description",
        content: "Watch a cross-border business payment settle in minutes, cost fully itemised.",
      },
    ],
  }),
  component: SendDemo,
});

const STAGES = [
  "Verifying recipient details",
  "Running compliance checks",
  "Converting currency at mid-market + 0.35%",
  "Instructing local payout",
  "Settled",
];

function SendDemo() {
  const notify = useServerFn(sendNotification);
  const [from, setFrom] = useState<Currency>("NGN");
  const [to, setTo] = useState<Currency>("GHS");
  const [amount, setAmount] = useState(3200000);
  const [payout, setPayout] = useState<PayMethod>("bank");
  const [recipient, setRecipient] = useState("Accra Packaging Co.");
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState(-1);
  const [done, setDone] = useState<{ reference: string } | null>(null);

  const quote = quoteCrossBorder(amount || 0, from, to, payout);

  useEffect(() => {
    if (stage < 0 || stage >= STAGES.length - 1) return;
    const t = setTimeout(() => setStage((s) => s + 1), 900);
    return () => clearTimeout(t);
  }, [stage]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStage(0);
    const reference = makeReference();
    await supabase.from("demo_transactions").insert({
      kind: "cross_border",
      reference,
      merchant: recipient,
      payer_email: email,
      send_currency: from,
      receive_currency: to,
      amount,
      partner_fee: quote.partnerFee,
      meridian_fee: quote.meridianFee,
      total_fee: quote.totalFee,
      recipient_gets: quote.recipientGets,
    });
    await notify({
      data: {
        to: email,
        subject: `Transfer ${reference} settled — Meridian demo`,
        heading: "Your transfer has settled",
        intro: `This is a demo confirmation for a simulated transfer to ${recipient}. In the live product this lands in your inbox the moment the payout clears.`,
        rows: [
          { label: "Reference", value: reference },
          { label: "Recipient", value: recipient },
          { label: "You sent", value: formatMoney(amount, from) },
          { label: "Total cost", value: formatMoney(quote.totalFee, from) },
          { label: "They received", value: formatMoney(quote.recipientGets, to) },
          { label: "Payout method", value: METHOD_LABEL[payout] },
        ],
        footnote: "Demo only — no money was moved.",
      },
    }).catch(() => undefined);
    setTimeout(() => {
      setDone({ reference });
      toast.success("Demo transfer settled — confirmation emailed.");
    }, 4200);
  }

  return (
    <div className="min-h-screen">
      <DemoBanner>Demo transfer — simulated end to end. No funds move.</DemoBanner>
      <header className="border-b border-border/70 px-5 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Wordmark />
          <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            Demo
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Meridian
        </Link>

        <h1 className="mt-6 font-display text-3xl font-bold">Pay a business in another country</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          This is the Meridian send flow. Choose a corridor, see exactly what it costs, and watch
          the payment settle.
        </p>

        {done ? (
          <div className="panel mx-auto mt-10 max-w-lg p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <h2 className="mt-4 font-display text-2xl font-bold">Transfer settled</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {recipient} received {formatMoney(quote.recipientGets, to)} in 2 minutes 08 seconds. A
              confirmation was emailed to {email}.
            </p>
            <p className="mt-4 font-mono text-sm text-primary">{done.reference}</p>
            <button
              onClick={() => {
                setDone(null);
                setStage(-1);
              }}
              className="mt-6 rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-secondary"
            >
              Send another
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <form onSubmit={send} className="panel space-y-5 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs text-muted-foreground">
                  You send
                  <select
                    value={from}
                    onChange={(e) => setFrom(e.target.value as Currency)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  They receive
                  <select
                    value={to}
                    onChange={(e) => setTo(e.target.value as Currency)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-xs text-muted-foreground">
                Amount
                <input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs text-muted-foreground">
                  Recipient business
                  <input
                    required
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Payout method
                  <select
                    value={payout}
                    onChange={(e) => setPayout(e.target.value as PayMethod)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="bank">Bank account</option>
                    <option value="momo">Mobile money</option>
                  </select>
                </label>
              </div>
              <label className="block text-xs text-muted-foreground">
                Your email (for the confirmation)
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>

              {stage >= 0 ? (
                <ol className="space-y-2 rounded-xl border border-border bg-surface/60 p-4 text-sm">
                  {STAGES.map((s, i) => (
                    <li key={s} className="flex items-center gap-2">
                      {i < stage ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : i === stage ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-border" />
                      )}
                      <span className={i <= stage ? "" : "text-muted-foreground"}>{s}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <button
                  type="submit"
                  className="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Send {formatMoney(amount || 0, from)}
                </button>
              )}
            </form>

            <FeeBreakdown quote={quote} currencyCode={from} receiveCurrency={to} />
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
