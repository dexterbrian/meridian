import { Meta, Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import CheckCircle2 from "lucide-solid/icons/check-circle-2";
import { For, Show, createSignal } from "solid-js";

import { FeeBreakdown, FeeSummary, WhyFeesCard } from "~/components/fee-breakdown";
import { INPUT_CLASS, PayMethodPicker, payButtonLabel } from "~/components/pay-methods";
import { DemoBanner } from "~/components/site/banner";
import { SiteFooter } from "~/components/site/footer";
import { DemoHeader } from "~/components/site/wordmark";
import { toast } from "~/components/ui/toast";
import {
  CURRENCIES,
  formatMoney,
  quoteCollection,
  type Currency,
  type PayMethod,
} from "~/lib/fees";
import { runDemoCheckout } from "~/server/public-actions";

const MERCHANT = "Ridgeway Hardware Ltd";

export default function CheckoutDemo() {
  const [method, setMethod] = createSignal<PayMethod | null>(null);
  const [currencyCode, setCurrencyCode] = createSignal<Currency>("KES");
  const [amount, setAmount] = createSignal(48500);
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [showBreakdown, setShowBreakdown] = createSignal(false);
  const [paid, setPaid] = createSignal<{ reference: string } | null>(null);

  // Until a method is picked there are no fees yet, so the payer total is the amount.
  const quote = () => quoteCollection(amount() || 0, method());

  async function pay(e: SubmitEvent) {
    e.preventDefault();
    const m = method();
    if (!m) return;
    setBusy(true);
    try {
      const result = await runDemoCheckout({
        amount: amount(),
        currency: currencyCode(),
        method: m,
        name: name(),
        email: email(),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPaid({ reference: result.reference });
      toast.success("Demo payment complete — receipt emailed.");
    } catch {
      toast.error("Demo payment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="min-h-screen">
      <Title>Demo checkout — Meridian</Title>
      <Meta
        name="description"
        content="What your customer sees when they pay you through Meridian. Bank, mobile money or card. Fees shown first."
      />
      <Meta property="og:title" content="Demo checkout — Meridian" />
      <Meta
        property="og:description"
        content="The Meridian checkout, with every fee shown before payment."
      />
      <DemoBanner>
        Demo checkout. This is what your customer sees. No money is collected.
      </DemoBanner>
      <DemoHeader />
      <main class="mx-auto max-w-5xl px-5 py-12">
        <A
          href="/"
          class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft class="h-4 w-4" /> Back to Meridian
        </A>

        <Show
          when={paid()}
          fallback={
            <div class="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <form onSubmit={pay} class="panel space-y-6 p-6">
                <div>
                  <p class="text-xs uppercase tracking-widest text-muted-foreground">Paying</p>
                  <h1 class="font-display text-2xl font-bold">{MERCHANT}</h1>
                  <p class="text-sm text-muted-foreground">Invoice INV-2048 · Power tools</p>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <input
                    required
                    autocomplete="name"
                    aria-label="Your name"
                    placeholder="Your name"
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                    class={INPUT_CLASS}
                  />
                  <input
                    required
                    type="email"
                    autocomplete="email"
                    aria-label="Email for receipt"
                    placeholder="Email for receipt"
                    value={email()}
                    onInput={(e) => setEmail(e.currentTarget.value)}
                    class={INPUT_CLASS}
                  />
                </div>

                <div class="space-y-3">
                  <div class="grid gap-4 sm:grid-cols-3">
                    <select
                      aria-label="Currency"
                      value={currencyCode()}
                      onChange={(e) => setCurrencyCode(e.currentTarget.value as Currency)}
                      class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 sm:col-span-1"
                    >
                      <For each={CURRENCIES}>
                        {(c) => (
                          <option value={c.code} selected={c.code === currencyCode()}>
                            {c.code}
                          </option>
                        )}
                      </For>
                    </select>
                    <input
                      type="number"
                      min={1}
                      aria-label="Amount"
                      placeholder="Amount"
                      value={amount()}
                      onInput={(e) => setAmount(Number(e.currentTarget.value))}
                      class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 sm:col-span-2"
                    />
                  </div>
                  <FeeSummary
                    quote={quote()}
                    currencyCode={currencyCode()}
                    note={method() ? undefined : "Pick a payment method to see the fees."}
                    open={showBreakdown()}
                    onToggle={() => setShowBreakdown((o) => !o)}
                    breakdownId="fee-breakdown"
                  />
                </div>

                <PayMethodPicker
                  method={method()}
                  onChange={setMethod}
                  total={formatMoney(quote().payerPays, currencyCode())}
                />

                <button
                  type="submit"
                  disabled={busy() || !method()}
                  class="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busy()
                    ? "Processing…"
                    : payButtonLabel(method(), formatMoney(quote().payerPays, currencyCode()))}
                </button>
                <p class="text-center text-xs text-muted-foreground">
                  Simulated payment. Nothing is charged.
                </p>
              </form>

              <div class="space-y-4">
                <Show when={showBreakdown()}>
                  <FeeBreakdown
                    id="fee-breakdown"
                    quote={quote()}
                    currencyCode={currencyCode()}
                    netLabel="Merchant receives"
                    note={method() ? undefined : "Pick a payment method to see the fees."}
                  />
                </Show>
                <WhyFeesCard />
              </div>
            </div>
          }
        >
          {(p) => (
            <div class="panel mx-auto mt-8 max-w-lg p-8 text-center">
              <CheckCircle2 class="mx-auto h-12 w-12 text-success" />
              <h1 class="mt-4 font-display text-2xl font-bold">Paid</h1>
              <p class="mt-2 text-sm text-muted-foreground">
                You paid {formatMoney(quote().payerPays, currencyCode())}. {MERCHANT} receives{" "}
                {formatMoney(quote().recipientGets, currencyCode())}. Receipt sent to {email()}.
              </p>
              <p class="mt-4 font-mono text-sm text-primary">{p().reference}</p>
              <button
                onClick={() => setPaid(null)}
                class="mt-6 rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-secondary"
              >
                Run the demo again
              </button>
            </div>
          )}
        </Show>
      </main>
      <SiteFooter />
    </div>
  );
}
