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
import { For, Match, Suspense, Switch, createSignal } from "solid-js";

import { FeeBreakdown } from "~/components/fee-breakdown";
import { DemoBanner } from "~/components/site/banner";
import { SiteFooter } from "~/components/site/footer";
import { DemoHeader } from "~/components/site/wordmark";
import { toast } from "~/components/ui/toast";
import { METHOD_LABEL, formatMoney, quoteCollection, type PayMethod } from "~/lib/fees";
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
  const [method, setMethod] = createSignal<PayMethod>("bank");
  const [payerEmail, setPayerEmail] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  async function settle() {
    if (!link()) return;
    setBusy(true);
    try {
      const result = await payDemoPaymentLink({
        reference: params.reference,
        method: method(),
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
      <DemoHeader width="3xl" />

      <main class="mx-auto max-w-3xl px-5 py-12">
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
                <div class="space-y-6">
                  <div class="panel p-6">
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

                  <div class="panel space-y-5 p-6">
                    <div>
                      <p class="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                        Pay with
                      </p>
                      <div class="grid gap-3 sm:grid-cols-3">
                        <For each={["bank", "momo", "card"] as PayMethod[]}>
                          {(m) => (
                            <button
                              type="button"
                              onClick={() => setMethod(m)}
                              class={`rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
                                method() === m
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border hover:bg-secondary"
                              }`}
                            >
                              {METHOD_LABEL[m]}
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                    <label class="block text-xs text-muted-foreground">
                      Your email (for the receipt)
                      <input
                        type="email"
                        value={payerEmail()}
                        onInput={(e) => setPayerEmail(e.currentTarget.value)}
                        class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    </label>

                    <FeeBreakdown
                      quote={quoteCollection(data().amount, method())}
                      currencyCode={data().currency}
                      netLabel={`${data().fromBusiness} receives`}
                    />

                    <button
                      type="button"
                      onClick={settle}
                      disabled={busy()}
                      class="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {busy()
                        ? "Processing…"
                        : `Pay ${formatMoney(data().amount, data().currency)}`}
                    </button>
                    <p class="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <ShieldCheck class="h-3.5 w-3.5" /> Simulated payment. Nothing is charged.
                    </p>
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
