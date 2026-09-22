import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ShieldCheck } from "lucide-react";

import { FeeBreakdown } from "@/components/fee-breakdown";
import { DemoBanner, SiteFooter, Wordmark } from "@/components/site-chrome";
import { supabase } from "@/integrations/supabase/client";
import { sendNotification } from "@/lib/notify.functions";
import {
  METHOD_LABEL,
  formatMoney,
  quoteCollection,
  type Currency,
  type PayMethod,
} from "@/lib/fees";

export const Route = createFileRoute("/pay/$reference")({
  head: () => ({
    meta: [
      { title: "Pay a Meridian request (demo)" },
      {
        name: "description",
        content: "Pay a Meridian payment request. Demo only. No money moves.",
      },
      { property: "og:title", content: "Pay a Meridian request (demo)" },
      {
        property: "og:description",
        content: "The payer side of a Meridian payment link.",
      },
    ],
  }),
  component: PayRequest,
});

function PayRequest() {
  const { reference } = useParams({ from: "/pay/$reference" });
  const notify = useServerFn(sendNotification);
  const [method, setMethod] = useState<PayMethod>("bank");
  const [payerEmail, setPayerEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["payment-request", reference],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_requests")
        .select("*")
        .eq("reference", reference)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function settle() {
    if (!data) return;
    setBusy(true);
    const quote = quoteCollection(Number(data.amount), method);
    await supabase
      .from("payment_requests")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("reference", reference);
    await supabase.from("demo_transactions").insert({
      kind: "payment_request",
      reference,
      merchant: data.from_business,
      payer_name: data.to_business,
      payer_email: payerEmail,
      send_currency: data.currency,
      receive_currency: data.currency,
      amount: Number(data.amount),
      partner_fee: quote.partnerFee,
      meridian_fee: quote.meridianFee,
      total_fee: quote.totalFee,
      recipient_gets: quote.recipientGets,
    });
    if (payerEmail) {
      await notify({
        data: {
          to: payerEmail,
          subject: `Payment ${reference} sent to ${data.from_business}`,
          heading: "Payment sent",
          intro: `Demo confirmation of your simulated payment of ${formatMoney(Number(data.amount), data.currency as Currency)} to ${data.from_business}.`,
          rows: [
            { label: "Reference", value: reference },
            { label: "Paid to", value: data.from_business },
            { label: "For", value: data.memo ?? "—" },
            {
              label: "Amount",
              value: formatMoney(Number(data.amount), data.currency as Currency),
            },
            { label: "Method", value: METHOD_LABEL[method] },
            {
              label: "They receive",
              value: formatMoney(quote.recipientGets, data.currency as Currency),
            },
          ],
          footnote: "Demo only — no money moved.",
        },
      }).catch(() => undefined);
    }
    setBusy(false);
    await refetch();
    toast.success("Demo payment sent.");
  }

  return (
    <div className="min-h-screen">
      <DemoBanner>Demo. This is what the payer sees. No money moves.</DemoBanner>
      <header className="border-b border-border/70 px-5 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Wordmark />
          <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            Demo
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading request…</p>
        ) : !data ? (
          <div className="panel p-8 text-center">
            <h1 className="font-display text-2xl font-bold">Link not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              No payment request matches {reference}. Create one in the demo.
            </p>
            <Link
              to="/demo/request"
              className="mt-6 inline-flex rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground"
            >
              Create a payment request
            </Link>
          </div>
        ) : data.status === "paid" ? (
          <div className="panel p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <h1 className="mt-4 font-display text-2xl font-bold">Paid</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatMoney(Number(data.amount), data.currency as Currency)} sent to{" "}
              {data.from_business}.
            </p>
            <p className="mt-4 font-mono text-sm text-primary">{data.reference}</p>
            <Link
              to="/"
              className="mt-6 inline-flex rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-secondary"
            >
              Back to Meridian
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="panel p-6">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Payment request
              </p>
              <h1 className="mt-1 font-display text-3xl font-bold">
                {formatMoney(Number(data.amount), data.currency as Currency)}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                From {data.from_business} to {data.to_business}
              </p>
              {data.memo && <p className="mt-1 text-sm">{data.memo}</p>}
              <p className="mt-3 font-mono text-xs text-primary">{data.reference}</p>
            </div>

            <div className="panel space-y-5 p-6">
              <div>
                <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                  Pay with
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["bank", "momo", "card"] as PayMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
                        method === m
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-secondary"
                      }`}
                    >
                      {METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block text-xs text-muted-foreground">
                Your email (for the receipt)
                <input
                  type="email"
                  value={payerEmail}
                  onChange={(e) => setPayerEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>

              <FeeBreakdown
                quote={quoteCollection(Number(data.amount), method)}
                currencyCode={data.currency as Currency}
                netLabel={`${data.from_business} receives`}
              />

              <button
                type="button"
                onClick={settle}
                disabled={busy}
                className="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy
                  ? "Processing…"
                  : `Pay ${formatMoney(Number(data.amount), data.currency as Currency)}`}
              </button>
              <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Simulated payment. Nothing is charged.
              </p>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
