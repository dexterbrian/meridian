import Building2 from "lucide-solid/icons/building-2";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import Copy from "lucide-solid/icons/copy";
import CreditCard from "lucide-solid/icons/credit-card";
import Smartphone from "lucide-solid/icons/smartphone";
import { For, Match, Show, Switch, createSignal, onCleanup, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";

import { toast } from "~/components/ui/toast";
import { METHOD_LABEL, type PayMethod } from "~/lib/fees";

// The payer's side of a demo payment: pick a method, then see what that method
// needs. Card and phone details stay in the browser. Nothing is sent anywhere.

export const PAY_METHODS: { id: PayMethod; icon: typeof Building2; blurb: string }[] = [
  { id: "bank", icon: Building2, blurb: "Pay from any local bank account" },
  { id: "momo", icon: Smartphone, blurb: "M-Pesa, MoMo, Airtel Money" },
  { id: "card", icon: CreditCard, blurb: "Visa or Mastercard" },
];

export const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70";

const DEMO_BANK = "Meridian Demo Bank";
const ACCOUNT_MINUTES = 30;

/** Text for the pay button once a method is chosen. */
export function payButtonLabel(method: PayMethod | null, total: string) {
  if (!method) return "Choose a payment method";
  return method === "bank" ? `I've paid ${total}` : `Pay ${total}`;
}

export function PayMethodPicker(props: {
  method: PayMethod | null;
  onChange: (method: PayMethod | null) => void;
  /** The amount the payer must send, already formatted. */
  total: string;
}) {
  const chosen = () => PAY_METHODS.find((m) => m.id === props.method);

  return (
    <div>
      <p class="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Payment method</p>
      <Show
        when={chosen()}
        fallback={
          <div class="grid gap-3 sm:grid-cols-3">
            <For each={PAY_METHODS}>
              {(m) => (
                <button
                  type="button"
                  onClick={() => props.onChange(m.id)}
                  class="rounded-xl border border-border p-3 text-left transition-colors hover:bg-secondary"
                >
                  <Dynamic component={m.icon} class="h-4 w-4 text-primary" />
                  <p class="mt-2 text-sm font-semibold">{METHOD_LABEL[m.id]}</p>
                  <p class="text-xs text-muted-foreground">{m.blurb}</p>
                </button>
              )}
            </For>
          </div>
        }
      >
        {(m) => (
          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary bg-primary/10 p-3">
              <div class="flex items-center gap-3">
                <Dynamic component={m().icon} class="h-4 w-4 text-primary" />
                <div>
                  <p class="text-sm font-semibold">{METHOD_LABEL[m().id]}</p>
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

            <Switch>
              <Match when={m().id === "bank"}>
                <BankDetails total={props.total} />
              </Match>
              <Match when={m().id === "card"}>
                <CardFields />
              </Match>
              <Match when={m().id === "momo"}>
                <input
                  type="tel"
                  required
                  autocomplete="tel"
                  aria-label="Mobile money number"
                  placeholder="Mobile money number, e.g. 0712 345 678"
                  class={INPUT_CLASS}
                />
              </Match>
            </Switch>
          </div>
        )}
      </Show>
    </div>
  );
}

function copy(value: string, what: string) {
  navigator.clipboard
    .writeText(value)
    .then(() => toast.success(`${what} copied.`))
    .catch(() => toast.error(`Could not copy the ${what.toLowerCase()}.`));
}

function CopyButton(props: { value: string; what: string }) {
  return (
    <button
      type="button"
      onClick={() => copy(props.value, props.what)}
      aria-label={`Copy ${props.what.toLowerCase()}`}
      class="rounded-md p-1 text-primary hover:bg-primary/10"
    >
      <Copy class="h-4 w-4" />
    </button>
  );
}

function BankDetails(props: { total: string }) {
  // A fresh one-off account per attempt, like a real virtual account.
  const account = String(Math.floor(1_000_000_000 + Math.random() * 9_000_000_000));
  const [left, setLeft] = createSignal(ACCOUNT_MINUTES * 60);
  onMount(() => {
    const timer = setInterval(() => setLeft((s) => Math.max(s - 1, 0)), 1000);
    onCleanup(() => clearInterval(timer));
  });
  const clock = () =>
    `${String(Math.floor(left() / 60)).padStart(2, "0")}:${String(left() % 60).padStart(2, "0")}`;

  return (
    <div class="overflow-hidden rounded-xl border border-border text-center">
      <div class="bg-primary/10 p-4">
        <p class="text-xs text-muted-foreground">Amount to send</p>
        <p class="mt-1 flex items-center justify-center gap-2 font-display text-xl font-semibold">
          {props.total} <CopyButton value={props.total} what="Amount" />
        </p>
      </div>
      <div class="space-y-4 bg-surface/60 p-4">
        <div>
          <p class="text-xs text-muted-foreground">Bank name</p>
          <p class="mt-1 text-sm font-semibold text-primary">{DEMO_BANK}</p>
        </div>
        <div>
          <p class="text-xs text-muted-foreground">Account number</p>
          <p class="mt-1 flex items-center justify-center gap-2 font-mono text-2xl font-semibold tracking-wider">
            {account} <CopyButton value={account} what="Account number" />
          </p>
        </div>
        <p class="text-xs text-muted-foreground">
          This account expires in <span class="font-semibold text-foreground">{clock()}</span>. Pay
          before it expires.
        </p>
      </div>
    </div>
  );
}

function CardFields() {
  return (
    <div class="space-y-3">
      <input
        required
        inputmode="numeric"
        autocomplete="cc-number"
        aria-label="Card number"
        placeholder="Card number"
        maxlength={23}
        class={INPUT_CLASS}
      />
      <div class="grid grid-cols-2 gap-3">
        <input
          required
          inputmode="numeric"
          autocomplete="cc-exp"
          aria-label="Expiry date"
          placeholder="MM/YY"
          maxlength={5}
          class={INPUT_CLASS}
        />
        <input
          required
          inputmode="numeric"
          autocomplete="cc-csc"
          aria-label="CVV"
          placeholder="CVV"
          maxlength={4}
          class={INPUT_CLASS}
        />
      </div>
      <p class="text-xs text-muted-foreground">
        We accept Visa and Mastercard. Demo only: card details never leave this page.
      </p>
    </div>
  );
}
