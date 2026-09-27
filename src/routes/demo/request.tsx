import { Meta, Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Copy from "lucide-solid/icons/copy";
import Link2 from "lucide-solid/icons/link-2";
import { For, Show, createSignal } from "solid-js";

import { DemoBanner } from "~/components/site/banner";
import { SiteFooter } from "~/components/site/footer";
import { DemoHeader } from "~/components/site/wordmark";
import { toast } from "~/components/ui/toast";
import { CURRENCIES, type Currency } from "~/lib/fees";
import { createDemoPaymentLink } from "~/server/public-actions";

export default function RequestDemo() {
  const [fromBusiness, setFromBusiness] = createSignal("Kilimo Fresh Exports Ltd");
  const [toBusiness, setToBusiness] = createSignal("Nordfrucht GmbH");
  const [toEmail, setToEmail] = createSignal("");
  const [amount, setAmount] = createSignal(36000);
  const [currencyCode, setCurrencyCode] = createSignal<Currency>("USD");
  const [memo, setMemo] = createSignal("Invoice INV-2048 — avocado shipment, week 38");
  const [busy, setBusy] = createSignal(false);
  const [created, setCreated] = createSignal<{ reference: string; url: string } | null>(null);

  async function create(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await createDemoPaymentLink({
        fromBusiness: fromBusiness(),
        toBusiness: toBusiness(),
        toEmail: toEmail(),
        amount: amount(),
        currency: currencyCode(),
        memo: memo(),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCreated({ reference: result.reference, url: result.url });
      toast.success("Payment request link created.");
    } catch {
      toast.error("Could not create the demo request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="min-h-screen">
      <Title>Demo payment link — Meridian</Title>
      <Meta
        name="description"
        content="Create a Meridian payment link and open it as the payer, from request to paid."
      />
      <Meta property="og:title" content="Demo payment link — Meridian" />
      <Meta
        property="og:description"
        content="Create a payment link, share it, and settle it as the payer."
      />
      <DemoBanner>Demo payment link. The link works. The money is not real.</DemoBanner>
      <DemoHeader />

      <main class="mx-auto max-w-5xl px-5 py-12">
        <A
          href="/"
          class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft class="h-4 w-4" /> Back to Meridian
        </A>

        <h1 class="mt-6 font-display text-3xl font-bold">Get paid with a link</h1>
        <p class="mt-2 max-w-2xl text-muted-foreground">
          Create the request. Share the link. Your buyer pays from their bank, card or mobile money.
          You get local currency.
        </p>

        <div class="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <form onSubmit={create} class="panel space-y-4 p-6">
            <div class="grid gap-4 sm:grid-cols-2">
              <input
                required
                aria-label="Your business"
                placeholder="Your business"
                value={fromBusiness()}
                onInput={(e) => setFromBusiness(e.currentTarget.value)}
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70"
              />
              <input
                required
                aria-label="Who is paying you"
                placeholder="Who is paying you"
                value={toBusiness()}
                onInput={(e) => setToBusiness(e.currentTarget.value)}
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70"
              />
              <select
                aria-label="Currency"
                value={currencyCode()}
                onChange={(e) => setCurrencyCode(e.currentTarget.value as Currency)}
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70"
              >
                <For each={CURRENCIES}>
                  {(c) => (
                    <option value={c.code} selected={c.code === currencyCode()}>
                      {c.code} — {c.name}
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
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70"
              />
            </div>
            <input
              aria-label="What is this for?"
              placeholder="What is this for?"
              value={memo()}
              onInput={(e) => setMemo(e.currentTarget.value)}
              class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70"
            />
            <input
              type="email"
              aria-label="Email the request to (optional)"
              placeholder="Email the request to (optional), e.g. accounts@nordfrucht.de"
              value={toEmail()}
              onInput={(e) => setToEmail(e.currentTarget.value)}
              class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70"
            />
            <button
              type="submit"
              disabled={busy()}
              class="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy() ? "Creating…" : "Create payment link"}
            </button>
          </form>

          <div class="panel p-6">
            <Show
              when={created()}
              fallback={
                <div class="space-y-3 text-sm text-muted-foreground">
                  <h2 class="font-display text-xl font-semibold text-foreground">How it works</h2>
                  <p>1. You create a request: amount and what it is for.</p>
                  <p>2. Meridian gives you a link. We can email it to the payer.</p>
                  <p>
                    3. The payer opens it, sees the fees, and pays from bank, card or mobile money.
                  </p>
                  <p>4. You both get a receipt. The request is marked paid.</p>
                  <p class="pt-2">
                    The same page can sit inside your own website as a checkout button.
                  </p>
                </div>
              }
            >
              {(c) => (
                <div class="space-y-4">
                  <Link2 class="h-6 w-6 text-primary" />
                  <h2 class="font-display text-xl font-semibold">Link ready</h2>
                  <p class="text-sm text-muted-foreground">
                    Share it with {toBusiness()}. Open it yourself to see what they see.
                  </p>
                  <div class="flex items-center gap-2 rounded-lg border border-border bg-surface/60 p-3">
                    <code class="flex-1 truncate font-mono text-xs text-primary">{c().url}</code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(c().url);
                        toast.success("Link copied");
                      }}
                      class="rounded-md border border-border p-2 hover:bg-secondary"
                      aria-label="Copy link"
                    >
                      <Copy class="h-4 w-4" />
                    </button>
                  </div>
                  <A
                    href={`/pay/${c().reference}`}
                    class="inline-flex w-full items-center justify-center rounded-full border border-primary/60 bg-primary/10 px-6 py-3 text-sm font-semibold text-primary hover:bg-primary/20"
                  >
                    Open it as the payer
                  </A>
                  <Show when={toEmail()}>
                    <p class="text-xs text-muted-foreground">
                      A demo request email was sent to {toEmail()}.
                    </p>
                  </Show>
                </div>
              )}
            </Show>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
