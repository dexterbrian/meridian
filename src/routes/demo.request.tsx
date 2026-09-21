import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, Link2 } from "lucide-react";

import { DemoBanner, SiteFooter, Wordmark } from "@/components/site-chrome";
import { supabase } from "@/integrations/supabase/client";
import { sendNotification } from "@/lib/notify.functions";
import { CURRENCIES, formatMoney, makeReference, type Currency } from "@/lib/fees";

export const Route = createFileRoute("/demo/request")({
  head: () => ({
    meta: [
      { title: "Demo payment request link — Meridian" },
      {
        name: "description",
        content:
          "Create a shareable Meridian payment request link and see the payer experience, from request to settled.",
      },
      { property: "og:title", content: "Demo payment request link — Meridian" },
      {
        property: "og:description",
        content: "Generate a payment link, share it, and watch the payer settle it in minutes.",
      },
    ],
  }),
  component: RequestDemo,
});

function RequestDemo() {
  const notify = useServerFn(sendNotification);
  const [fromBusiness, setFromBusiness] = useState("Savanna Textiles Ltd");
  const [toBusiness, setToBusiness] = useState("Accra Packaging Co.");
  const [toEmail, setToEmail] = useState("");
  const [amount, setAmount] = useState(850000);
  const [currencyCode, setCurrencyCode] = useState<Currency>("NGN");
  const [memo, setMemo] = useState("Invoice INV-2048 — 400 rolls of cotton");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ reference: string; url: string } | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const reference = makeReference();
    const { error } = await supabase.from("payment_requests").insert({
      reference,
      from_business: fromBusiness,
      to_business: toBusiness,
      to_email: toEmail || null,
      amount,
      currency: currencyCode,
      memo,
    });
    if (error) {
      setBusy(false);
      toast.error("Could not create the demo request.");
      return;
    }
    const url = `${window.location.origin}/pay/${reference}`;
    if (toEmail) {
      await notify({
        data: {
          to: toEmail,
          subject: `${fromBusiness} requests ${formatMoney(amount, currencyCode)}`,
          heading: `${fromBusiness} sent you a payment request`,
          intro: `Open the link below to settle this request. This is a product demo — no money will move.\n${url}`,
          rows: [
            { label: "Reference", value: reference },
            { label: "Amount", value: formatMoney(amount, currencyCode) },
            { label: "For", value: memo || "—" },
            { label: "Payment link", value: url },
          ],
          footnote: "Demo only — no funds are requested or collected.",
        },
      }).catch(() => undefined);
    }
    setBusy(false);
    setCreated({ reference, url });
    toast.success("Payment request link created.");
  }

  return (
    <div className="min-h-screen">
      <DemoBanner>Demo payment request — links are real, money is not.</DemoBanner>
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

        <h1 className="mt-6 font-display text-3xl font-bold">Request a payment with a link</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Ask another business to pay you without invoices going missing. Create the request, share
          the link, and the payer settles it in a couple of taps — in their own currency.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <form onSubmit={create} className="panel space-y-4 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Your business
                <input
                  required
                  value={fromBusiness}
                  onChange={(e) => setFromBusiness(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Business you're billing
                <input
                  required
                  value={toBusiness}
                  onChange={(e) => setToBusiness(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Currency
                <select
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value as Currency)}
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
            <label className="block text-xs text-muted-foreground">
              What is this for?
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              Email the request to (optional)
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="finance@accrapackaging.com"
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create payment link"}
            </button>
          </form>

          <div className="panel p-6">
            {created ? (
              <div className="space-y-4">
                <Link2 className="h-6 w-6 text-primary" />
                <h2 className="font-display text-xl font-semibold">Your request is live</h2>
                <p className="text-sm text-muted-foreground">
                  Share this link with {toBusiness}. Opening it shows them the payment page — try it
                  yourself to see the payer side.
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface/60 p-3">
                  <code className="flex-1 truncate font-mono text-xs text-primary">
                    {created.url}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(created.url);
                      toast.success("Link copied");
                    }}
                    className="rounded-md border border-border p-2 hover:bg-secondary"
                    aria-label="Copy link"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <Link
                  to="/pay/$reference"
                  params={{ reference: created.reference }}
                  className="inline-flex w-full items-center justify-center rounded-full border border-primary/60 bg-primary/10 px-6 py-3 text-sm font-semibold text-primary hover:bg-primary/20"
                >
                  Open it as the payer
                </Link>
                {toEmail && (
                  <p className="text-xs text-muted-foreground">
                    A demo request email was sent to {toEmail}.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-sm text-muted-foreground">
                <h2 className="font-display text-xl font-semibold text-foreground">
                  How the loop works
                </h2>
                <p>1. You create a request for a specific amount and reason.</p>
                <p>2. Meridian generates a secure link and can email it to the payer.</p>
                <p>
                  3. The payer opens it, sees the full cost breakdown, and settles from their bank
                  or mobile money account.
                </p>
                <p>4. Both sides get a confirmation and the request is marked paid.</p>
              </div>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
