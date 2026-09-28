import { Meta, Title } from "@solidjs/meta";
import {
  A,
  createAsync,
  query,
  revalidate,
  useParams,
  type RouteDefinition,
} from "@solidjs/router";
import CheckCircle2 from "lucide-solid/icons/check-circle-2";
import ShieldCheck from "lucide-solid/icons/shield-check";
import { Match, Show, Suspense, Switch, createSignal } from "solid-js";

import { FeeBreakdown, FeeSummary, WhyFeesCard } from "~/components/fee-breakdown";
import { INPUT_CLASS, PayMethodPicker, payButtonLabel } from "~/components/pay-methods";
import { DemoBanner } from "~/components/site/banner";
import { SiteFooter } from "~/components/site/footer";
import { DemoHeader } from "~/components/site/wordmark";
import { toast } from "~/components/ui/toast";
import { formatMoney, quoteCollection, type PayMethod } from "~/lib/fees";
import { getDemoPaymentLink, payDemoPaymentLink } from "~/server/public-actions";

// Demo mode: the request lives in demo_transactions. Phase 3 replaces this with
// real payment requests.
const loadLink = query((reference: string) => getDemoPaymentLink(reference), "demo-payment-link");

export const route = {
  preload: ({ params }) => loadLink(params["reference"] ?? ""),
} satisfies RouteDefinition;

export default function PayRequest() {
  const params = useParams<{ reference: string }>();
  const link = createAsync(() => loadLink(params.reference));
  const [method, setMethod] = createSignal<PayMethod | null>(null);
  const [payerEmail, setPayerEmail] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [showBreakdown, setShowBreakdown] = createSignal(false);
  // Until a method is picked there are no fees yet, so the payer total is the amount.
  const quote = (amount: number) => quoteCollection(amount, method());

  async function settle(e: SubmitEvent) {
    e.preventDefault();
    const m = method();
    if (!link() || !m) return;
    setBusy(true);
    try {
      const result = await payDemoPaymentLink({
        reference: params.reference,
        method: m,
        payerEmail: payerEmail(),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await revalidate(loadLink.keyFor(params.reference));
      toast.success("Demo payment sent.");
    } catch {
      toast.error("Payment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="min-h-screen">
      <Title>Pay a Meridian request (demo)</Title>
      <Meta
        name="description"
        content="Pay a Meridian payment request. Demo only. No money moves."
      />
      <Meta property="og:title" content="Pay a Meridian request (demo)" />
      <Meta property="og:description" content="The payer side of a Meridian payment link." />
      <DemoBanner>Demo. This is what the payer sees. No money moves.</DemoBanner>
      <DemoHeader />

      <main class="mx-auto max-w-5xl px-5 py-12">
        <Suspense fallback={<p class="text-sm text-muted-foreground">Loading request…</p>}>
          <Switch>
            <Match when={link() === null}>
              <div class="panel p-8 text-center">
                <h1 class="font-display text-2xl font-bold">Link not found</h1>
                <p class="mt-2 text-sm text-muted-foreground">
                  No payment request matches {params.reference}. Create one in the demo.
                </p>
                <A
                  href="/demo/request"
                  class="mt-6 inline-flex rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground"
                >
                  Create a payment request
                </A>
              </div>
            </Match>
            <Match when={link()?.status === "paid" && link()}>
              {(data) => (
                <div class="panel p-8 text-center">
                  <CheckCircle2 class="mx-auto h-12 w-12 text-success" />
                  <h1 class="mt-4 font-display text-2xl font-bold">Paid</h1>
                  <p class="mt-2 text-sm text-muted-foreground">
                    {formatMoney(data().amount, data().currency)} sent to {data().fromBusiness}.
                  </p>
                  <p class="mt-4 font-mono text-sm text-primary">{data().reference}</p>
                  <A
                    href="/"
                    class="mt-6 inline-flex rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-secondary"
                  >
                    Back to Meridian
                  </A>
                </div>
              )}
            </Match>
            <Match when={link()}>
              {(data) => (
                <div class="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                  <form onSubmit={settle} class="panel space-y-6 p-6">
                    <div>
                      <p class="text-xs uppercase tracking-widest text-muted-foreground">
                        Payment request
                      </p>
                      <h1 class="mt-1 font-display text-3xl font-bold">
                        {formatMoney(data().amount, data().currency)}
                      </h1>
                      <p class="mt-2 text-sm text-muted-foreground">
                        From {data().fromBusiness} to {data().toBusiness}
                      </p>
                      {data().memo && <p class="mt-1 text-sm">{data().memo}</p>}
                      <p class="mt-3 font-mono text-xs text-primary">{data().reference}</p>
                    </div>

                    <FeeSummary
                      quote={quote(data().amount)}
                      currencyCode={data().currency}
                      note={method() ? undefined : "Pick a payment method to see the fees."}
                      open={showBreakdown()}
                      onToggle={() => setShowBreakdown((o) => !o)}
                      breakdownId="fee-breakdown"
                    />

                    <input
                      type="email"
                      autocomplete="email"
                      aria-label="Your email for the receipt"
                      placeholder="Your email for the receipt"
                      value={payerEmail()}
                      onInput={(e) => setPayerEmail(e.currentTarget.value)}
                      class={INPUT_CLASS}
                    />

                    <PayMethodPicker
                      method={method()}
                      onChange={setMethod}
                      total={formatMoney(quote(data().amount).payerPays, data().currency)}
                    />

                    <button
                      type="submit"
                      disabled={busy() || !method()}
                      class="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {busy()
                        ? "Processing…"
                        : payButtonLabel(
                            method(),
                            formatMoney(quote(data().amount).payerPays, data().currency),
                          )}
                    </button>
                    <p class="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <ShieldCheck class="h-3.5 w-3.5" /> Simulated payment. Nothing is charged.
                    </p>
                  </form>

                  <div class="space-y-4">
                    <Show when={showBreakdown()}>
                      <FeeBreakdown
                        id="fee-breakdown"
                        quote={quote(data().amount)}
                        currencyCode={data().currency}
                        netLabel={`${data().fromBusiness} receives`}
                        note={method() ? undefined : "Pick a payment method to see the fees."}
                      />
                    </Show>
                    <WhyFeesCard />
                  </div>
                </div>
              )}
            </Match>
          </Switch>
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
