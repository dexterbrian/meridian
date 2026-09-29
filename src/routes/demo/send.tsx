import { Meta, Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Building2 from "lucide-solid/icons/building-2";
import CheckCircle2 from "lucide-solid/icons/check-circle-2";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import Loader2 from "lucide-solid/icons/loader-2";
import Smartphone from "lucide-solid/icons/smartphone";
import Wallet from "lucide-solid/icons/wallet";
import { For, Match, Show, Switch, createEffect, createSignal, onCleanup } from "solid-js";
import { Dynamic } from "solid-js/web";

import { FeeBreakdown } from "~/components/fee-breakdown";
import { INPUT_CLASS } from "~/components/pay-methods";
import { DemoBanner } from "~/components/site/banner";
import { SiteFooter } from "~/components/site/footer";
import { DemoHeader } from "~/components/site/wordmark";
import { toast } from "~/components/ui/toast";
import { CURRENCIES, convert, formatMoney, quoteCrossBorder, type Currency } from "~/lib/fees";
import { runDemoSend } from "~/server/public-actions";

const STAGES = [
  "Checking recipient details",
  "Running compliance checks",
  "Debiting your Meridian balance",
  "Converting with our partner",
  "Sending local payout",
  "Settled",
];

/** The demo sender's balance, worth USD 20,000 in whichever currency they send from. */
const DEMO_BALANCE_USD = 20_000;

type PayoutMethod = "bank" | "momo";

const PAYOUT_METHODS: { id: PayoutMethod; icon: typeof Building2; label: string; blurb: string }[] =
  [
    { id: "bank", icon: Building2, label: "Bank account", blurb: "Paid into their bank" },
    { id: "momo", icon: Smartphone, label: "Mobile money", blurb: "M-Pesa, MoMo, Alipay and more" },
  ];

/**
 * Where the recipient gets paid. Pick a method, then enter their details, the
 * same pattern as the checkout's payment method picker.
 */
function PayoutMethodPicker(props: {
  method: PayoutMethod | null;
  onChange: (m: PayoutMethod | null) => void;
  details: Record<string, string>;
  onDetail: (key: string, value: string) => void;
}) {
  const chosen = () => PAYOUT_METHODS.find((m) => m.id === props.method);
  const field = (key: string, placeholder: string, extra: Record<string, string> = {}) => (
    <input
      required
      aria-label={placeholder}
      placeholder={placeholder}
      value={props.details[key] ?? ""}
      onInput={(e) => props.onDetail(key, e.currentTarget.value)}
      class={INPUT_CLASS}
      {...extra}
    />
  );
  return (
    <div>
      <p class="mb-2 text-xs uppercase tracking-widest text-muted-foreground">How they get paid</p>
      <Show
        when={chosen()}
        fallback={
          <div class="grid gap-3 sm:grid-cols-2">
            <For each={PAYOUT_METHODS}>
              {(m) => (
                <button
                  type="button"
                  onClick={() => props.onChange(m.id)}
                  class="rounded-xl border border-border p-3 text-left transition-colors hover:bg-secondary"
                >
                  <Dynamic component={m.icon} class="h-4 w-4 text-primary" />
                  <p class="mt-2 text-sm font-semibold">{m.label}</p>
                  <p class="text-xs text-muted-foreground">{m.blurb}</p>
                </button>
              )}
            </For>
          </div>
        }
      >
        {(m) => (
          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary bg-primary/10 p-3">
              <div class="flex items-center gap-3">
                <Dynamic component={m().icon} class="h-4 w-4 text-primary" />
                <div>
                  <p class="text-sm font-semibold">{m().label}</p>
                  <p class="text-xs text-muted-foreground">{m().blurb}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => props.onChange(null)}
                class="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
              >
                <ChevronLeft class="h-3.5 w-3.5" /> Change Payment Option
              </button>
            </div>
            <Show
              when={m().id === "bank"}
              fallback={
                <div class="grid gap-3 sm:grid-cols-2">
                  {field("provider", "Provider, e.g. M-Pesa")}
                  {field("phone", "Their mobile money number", { type: "tel", inputmode: "tel" })}
                </div>
              }
            >
              <div class="grid gap-3 sm:grid-cols-2">
                {field("bank", "Their bank name")}
                {field("account", "Their account number", { inputmode: "numeric" })}
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}

/** "••••6789" for an account or phone number, for the confirmation. */
function masked(value: string): string {
  const v = value.replace(/\s/g, "");
  return v.length > 4 ? `••••${v.slice(-4)}` : v;
}

export default function SendDemo() {
  const [from, setFrom] = createSignal<Currency>("KES");
  const [to, setTo] = createSignal<Currency>("USD");
  const [amount, setAmount] = createSignal(650000);
  const [payout, setPayout] = createSignal<PayoutMethod | null>(null);
  const [details, setDetails] = createSignal<Record<string, string>>({});
  const [recipient, setRecipient] = createSignal("Shenzhen Tools Co.");
  const [email, setEmail] = createSignal("");
  const [stage, setStage] = createSignal(-1);
  const [done, setDone] = createSignal<{ reference: string } | null>(null);

  const quote = () => quoteCrossBorder(amount() || 0, from(), to(), payout() ?? "bank");
  const balance = () => convert(DEMO_BALANCE_USD, "USD", from());
  const balanceAfter = () => balance() - quote().payerPays;
  const enough = () => balanceAfter() >= 0;
  const destination = () => {
    const d = details();
    return payout() === "momo"
      ? `${d["provider"] ?? "Mobile money"} ${masked(d["phone"] ?? "")}`
      : `${d["bank"] ?? "Bank"} ${masked(d["account"] ?? "")}`;
  };

  // Walk through the stages, one every 0.9 seconds, like the real status feed.
  createEffect(() => {
    const s = stage();
    if (s < 0 || s >= STAGES.length - 1) return;
    const t = setTimeout(() => setStage(s + 1), 900);
    onCleanup(() => clearTimeout(t));
  });

  async function send(e: SubmitEvent) {
    e.preventDefault();
    const method = payout();
    if (!method) return toast.error("Choose how they get paid.");
    if (!enough()) return toast.error("Not enough in your Meridian balance for this transfer.");
    setStage(0);
    try {
      const result = await runDemoSend({
        amount: amount(),
        from: from(),
        to: to(),
        payout: method,
        recipient: recipient(),
        destination: destination(),
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
                <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3">
                  <div class="flex items-center gap-3">
                    <Wallet class="h-5 w-5 text-primary" />
                    <div>
                      <p class="text-xs uppercase tracking-widest text-muted-foreground">
                        From your Meridian balance
                      </p>
                      <p class="font-display text-lg font-semibold">
                        {formatMoney(balance(), from())}
                      </p>
                    </div>
                  </div>
                  <p class={`text-xs ${enough() ? "text-muted-foreground" : "text-destructive"}`}>
                    {enough()
                      ? `After this transfer: ${formatMoney(balanceAfter(), from())}`
                      : `Short by ${formatMoney(-balanceAfter(), from())}`}
                  </p>
                </div>
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
                <input
                  type="number"
                  min={1}
                  aria-label="Amount"
                  placeholder="Amount"
                  value={amount()}
                  onInput={(e) => setAmount(Number(e.currentTarget.value))}
                  class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70"
                />
                <input
                  required
                  aria-label="Supplier's name, as on their account"
                  placeholder="Supplier's name, as on their account"
                  value={recipient()}
                  onInput={(e) => setRecipient(e.currentTarget.value)}
                  class={INPUT_CLASS}
                />
                <PayoutMethodPicker
                  method={payout()}
                  onChange={setPayout}
                  details={details()}
                  onDetail={(k, v) => setDetails((d) => ({ ...d, [k]: v }))}
                />
                <input
                  required
                  type="email"
                  autocomplete="email"
                  aria-label="Your email for the confirmation"
                  placeholder="Your email for the confirmation"
                  value={email()}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                  class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70"
                />

                <Show
                  when={stage() >= 0}
                  fallback={
                    <button
                      type="submit"
                      disabled={!payout() || !enough()}
                      class="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {!payout()
                        ? "Choose how they get paid"
                        : !enough()
                          ? "Not enough balance"
                          : `Send ${formatMoney(quote().payerPays, from())} from your balance`}
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
                {recipient()} received {formatMoney(quote().recipientGets, to())} to {destination()}
                .{formatMoney(quote().payerPays, from())} came out of your Meridian balance.
                Confirmation sent to {email()}.
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
