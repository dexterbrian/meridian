import { Meta, Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import CheckCircle2 from "lucide-solid/icons/check-circle-2";
import Loader2 from "lucide-solid/icons/loader-2";
import { For, Match, Show, Switch, createEffect, createSignal, onCleanup } from "solid-js";

import { FeeBreakdown } from "~/components/fee-breakdown";
import { DemoBanner } from "~/components/site/banner";
import { SiteFooter } from "~/components/site/footer";
import { DemoHeader } from "~/components/site/wordmark";
import { toast } from "~/components/ui/toast";
import { CURRENCIES, formatMoney, quoteCrossBorder, type Currency } from "~/lib/fees";
import { runDemoSend } from "~/server/public-actions";

const STAGES = [
  "Checking recipient details",
  "Running compliance checks",
  "Converting with our partner",
  "Sending local payout",
  "Settled",
];

export default function SendDemo() {
  const [from, setFrom] = createSignal<Currency>("KES");
  const [to, setTo] = createSignal<Currency>("USD");
  const [amount, setAmount] = createSignal(650000);
  const [payout, setPayout] = createSignal<"bank" | "momo">("bank");
  const [recipient, setRecipient] = createSignal("Shenzhen Tools Co.");
  const [email, setEmail] = createSignal("");
  const [stage, setStage] = createSignal(-1);
  const [done, setDone] = createSignal<{ reference: string } | null>(null);

  const quote = () => quoteCrossBorder(amount() || 0, from(), to(), payout());

  // Walk through the stages, one every 0.9 seconds, like the real status feed.
  createEffect(() => {
    const s = stage();
    if (s < 0 || s >= STAGES.length - 1) return;
    const t = setTimeout(() => setStage(s + 1), 900);
    onCleanup(() => clearTimeout(t));
  });

  async function send(e: SubmitEvent) {
    e.preventDefault();
    setStage(0);
    try {
      const result = await runDemoSend({
        amount: amount(),
        from: from(),
        to: to(),
        payout: payout(),
        recipient: recipient(),
        email: email(),
      });
      if (!result.ok) {
        setStage(-1);
        toast.error(result.error);
        return;
      }
      setTimeout(() => {
        setDone({ reference: result.reference });
        toast.success("Demo transfer settled — confirmation emailed.");
      }, 4200);
    } catch {
      setStage(-1);
      toast.error("Demo transfer failed. Please try again.");
    }
  }

  return (
    <div class="min-h-screen">
      <Title>Demo: pay a supplier abroad — Meridian</Title>
      <Meta
        name="description"
        content="Simulate paying a supplier in another country with Meridian. Fees shown, conversion by our partner, payout in minutes."
      />
      <Meta property="og:title" content="Demo: pay a supplier abroad — Meridian" />
      <Meta
        property="og:description"
        content="Watch a supplier payment settle in minutes with every fee itemised."
      />
      <DemoBanner>Demo transfer. Simulated end to end. No funds move.</DemoBanner>
      <DemoHeader />

      <main class="mx-auto max-w-5xl px-5 py-12">
        <A
          href="/"
          class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft class="h-4 w-4" /> Back to Meridian
        </A>

        <h1 class="mt-6 font-display text-3xl font-bold">Pay a supplier abroad</h1>
        <p class="mt-2 max-w-2xl text-muted-foreground">
          Pick the currencies, see the cost, watch it settle.
        </p>

        <Show
          when={done()}
          fallback={
            <div class="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <form onSubmit={send} class="panel space-y-5 p-6">
                <div class="grid gap-4 sm:grid-cols-2">
                  <label class="text-xs text-muted-foreground">
                    You send
                    <select
                      value={from()}
                      onChange={(e) => setFrom(e.currentTarget.value as Currency)}
                      class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <For each={CURRENCIES}>
                        {(c) => (
                          <option value={c.code} selected={c.code === from()}>
                            {c.code} — {c.name}
                          </option>
                        )}
                      </For>
                    </select>
                  </label>
                  <label class="text-xs text-muted-foreground">
                    They receive
                    <select
                      value={to()}
                      onChange={(e) => setTo(e.currentTarget.value as Currency)}
                      class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <For each={CURRENCIES}>
                        {(c) => (
                          <option value={c.code} selected={c.code === to()}>
                            {c.code} — {c.name}
                          </option>
                        )}
                      </For>
                    </select>
                  </label>
                </div>
                <label class="block text-xs text-muted-foreground">
                  Amount
                  <input
                    type="number"
                    min={1}
                    value={amount()}
                    onInput={(e) => setAmount(Number(e.currentTarget.value))}
                    class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
                <div class="grid gap-4 sm:grid-cols-2">
                  <label class="text-xs text-muted-foreground">
                    Supplier
                    <input
                      required
                      value={recipient()}
                      onInput={(e) => setRecipient(e.currentTarget.value)}
                      class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label class="text-xs text-muted-foreground">
                    Payout method
                    <select
                      value={payout()}
                      onChange={(e) => setPayout(e.currentTarget.value as "bank" | "momo")}
                      class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="bank">Bank account</option>
                      <option value="momo">Mobile money</option>
                    </select>
                  </label>
                </div>
                <label class="block text-xs text-muted-foreground">
                  Your email (for the confirmation)
                  <input
                    required
                    type="email"
                    value={email()}
                    onInput={(e) => setEmail(e.currentTarget.value)}
                    class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>

                <Show
                  when={stage() >= 0}
                  fallback={
                    <button
                      type="submit"
                      class="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      Send {formatMoney(quote().payerPays, from())}
                    </button>
                  }
                >
                  <ol class="space-y-2 rounded-xl border border-border bg-surface/60 p-4 text-sm">
                    <For each={STAGES}>
                      {(s, i) => (
                        <li class="flex items-center gap-2">
                          <Switch
                            fallback={<span class="h-4 w-4 rounded-full border border-border" />}
                          >
                            <Match when={i() < stage()}>
                              <CheckCircle2 class="h-4 w-4 text-success" />
                            </Match>
                            <Match when={i() === stage()}>
                              <Loader2 class="h-4 w-4 animate-spin text-primary" />
                            </Match>
                          </Switch>
                          <span class={i() <= stage() ? "" : "text-muted-foreground"}>{s}</span>
                        </li>
                      )}
                    </For>
                  </ol>
                </Show>
              </form>

              <FeeBreakdown quote={quote()} currencyCode={from()} receiveCurrency={to()} />
            </div>
          }
        >
          {(d) => (
            <div class="panel mx-auto mt-10 max-w-lg p-8 text-center">
              <CheckCircle2 class="mx-auto h-12 w-12 text-success" />
              <h2 class="mt-4 font-display text-2xl font-bold">Transfer settled</h2>
              <p class="mt-2 text-sm text-muted-foreground">
                {recipient()} received {formatMoney(quote().recipientGets, to())}. Confirmation sent
                to {email()}.
              </p>
              <p class="mt-4 font-mono text-sm text-primary">{d().reference}</p>
              <button
                onClick={() => {
                  setDone(null);
                  setStage(-1);
                }}
                class="mt-6 rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-secondary"
              >
                Send another
              </button>
            </div>
          )}
        </Show>
      </main>
      <SiteFooter />
    </div>
  );
}
