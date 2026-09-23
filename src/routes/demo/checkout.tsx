import { Meta, Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Building2 from "lucide-solid/icons/building-2";
import CheckCircle2 from "lucide-solid/icons/check-circle-2";
import CreditCard from "lucide-solid/icons/credit-card";
import Smartphone from "lucide-solid/icons/smartphone";
import { For, Show, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";

import { FeeBreakdown } from "~/components/fee-breakdown";
import { DemoBanner } from "~/components/site/banner";
import { SiteFooter } from "~/components/site/footer";
import { DemoHeader } from "~/components/site/wordmark";
import { toast } from "~/components/ui/toast";
import {
  CURRENCIES,
  METHOD_LABEL,
  formatMoney,
  quoteCollection,
  type Currency,
  type PayMethod,
} from "~/lib/fees";
import { runDemoCheckout } from "~/server/public-actions";

const METHODS: { id: PayMethod; icon: typeof Building2; blurb: string }[] = [
  { id: "bank", icon: Building2, blurb: "Pay from any local bank account" },
  { id: "momo", icon: Smartphone, blurb: "M-Pesa, MoMo, Airtel Money" },
  { id: "card", icon: CreditCard, blurb: "Visa or Mastercard" },
];

const MERCHANT = "Ridgeway Hardware Ltd";

export default function CheckoutDemo() {
  const [method, setMethod] = createSignal<PayMethod>("momo");
  const [currencyCode, setCurrencyCode] = createSignal<Currency>("KES");
  const [amount, setAmount] = createSignal(48500);
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [paid, setPaid] = createSignal<{ reference: string } | null>(null);

  const quote = () => quoteCollection(amount() || 0, method());

  async function pay(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await runDemoCheckout({
        amount: amount(),
        currency: currencyCode(),
        method: method(),
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

                <div class="grid gap-4 sm:grid-cols-3">
                  <label class="text-xs text-muted-foreground sm:col-span-1">
                    Currency
                    <select
                      value={currencyCode()}
                      onChange={(e) => setCurrencyCode(e.currentTarget.value as Currency)}
                      class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <For each={CURRENCIES}>
                        {(c) => (
                          <option value={c.code} selected={c.code === currencyCode()}>
                            {c.code}
                          </option>
                        )}
                      </For>
                    </select>
                  </label>
                  <label class="text-xs text-muted-foreground sm:col-span-2">
                    Amount
                    <input
                      type="number"
                      min={1}
                      value={amount()}
                      onInput={(e) => setAmount(Number(e.currentTarget.value))}
                      class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <div>
                  <p class="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                    Payment method
                  </p>
                  <div class="grid gap-3 sm:grid-cols-3">
                    <For each={METHODS}>
                      {(m) => (
                        <button
                          type="button"
                          onClick={() => setMethod(m.id)}
                          class={`rounded-xl border p-3 text-left transition-colors ${
                            method() === m.id
                              ? "border-primary bg-primary/10"
                              : "border-border hover:bg-secondary"
                          }`}
                        >
                          <Dynamic component={m.icon} class="h-4 w-4 text-primary" />
                          <p class="mt-2 text-sm font-semibold">{METHOD_LABEL[m.id]}</p>
                          <p class="text-xs text-muted-foreground">{m.blurb}</p>
                        </button>
                      )}
                    </For>
                  </div>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <label class="text-xs text-muted-foreground">
                    Your name
                    <input
                      required
                      value={name()}
                      onInput={(e) => setName(e.currentTarget.value)}
                      class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label class="text-xs text-muted-foreground">
                    Email for receipt
                    <input
                      required
                      type="email"
                      value={email()}
                      onInput={(e) => setEmail(e.currentTarget.value)}
                      class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={busy()}
                  class="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busy() ? "Processing…" : `Pay ${formatMoney(amount() || 0, currencyCode())}`}
                </button>
                <p class="text-center text-xs text-muted-foreground">
                  Simulated payment. Nothing is charged.
                </p>
              </form>

              <div class="space-y-4">
                <FeeBreakdown
                  quote={quote()}
                  currencyCode={currencyCode()}
                  netLabel="Merchant receives"
                />
                <div class="panel p-5 text-sm text-muted-foreground">
                  <p class="font-semibold text-foreground">Why you see the fees</p>
                  <p class="mt-2">
                    Meridian shows the partner fee and our 1% before anyone pays. No surprise
                    deductions when the money lands.
                  </p>
                </div>
              </div>
            </div>
          }
        >
          {(p) => (
            <div class="panel mx-auto mt-8 max-w-lg p-8 text-center">
              <CheckCircle2 class="mx-auto h-12 w-12 text-success" />
              <h1 class="mt-4 font-display text-2xl font-bold">Paid</h1>
              <p class="mt-2 text-sm text-muted-foreground">
                {formatMoney(amount(), currencyCode())} paid to {MERCHANT}. Receipt sent to{" "}
                {email()}.
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
