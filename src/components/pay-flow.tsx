import Building2 from "lucide-solid/icons/building-2";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import Copy from "lucide-solid/icons/copy";
import CreditCard from "lucide-solid/icons/credit-card";
import Smartphone from "lucide-solid/icons/smartphone";
import { For, Match, Show, Switch, createSignal, onCleanup, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";

import { toast } from "~/components/ui/toast";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  Field,
  INPUT_CLASS,
  SELECT_CLASS,
} from "~/components/ui/field";
import { METHOD_LABEL, type Currency, type PayMethod } from "~/lib/fees";
import { COUNTRY_NAMES, momoNumberLength, networksFor } from "~/lib/payaza-codes";
import type { PayinDetails } from "~/server/money/collect";

// The payer's side of a real Payaza payment: choose a method, give what it
// needs, then follow the instructions Payaza sends back. Card entry happens in
// Payaza's own checkout, never in our form.

const METHODS: { id: PayMethod; icon: typeof Building2; blurb: (c: Currency) => string }[] = [
  {
    id: "momo",
    icon: Smartphone,
    blurb: (c) =>
      c === "KES"
        ? "M-Pesa, Airtel Money"
        : c === "XOF"
          ? "Orange, MTN, Wave, Moov"
          : "MTN, Airtel, Vodafone and more",
  },
  {
    id: "bank",
    icon: Building2,
    blurb: (c) => (c === "ZAR" ? "Instant EFT from your bank" : "Transfer to a one-off account"),
  },
  { id: "card", icon: CreditCard, blurb: () => "Visa, Mastercard, Apple Pay, Google Pay" },
];

export function MethodChoice(props: {
  currency: Currency;
  available: PayMethod[];
  method: PayMethod | null;
  onChange: (m: PayMethod | null) => void;
}) {
  const chosen = () => METHODS.find((m) => m.id === props.method);
  return (
    <div>
      <p class="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Payment method</p>
      <Show
        when={chosen()}
        fallback={
          <div class="grid gap-3 sm:grid-cols-3">
            <For each={METHODS.filter((m) => props.available.includes(m.id))}>
              {(m) => (
                <button
                  type="button"
                  onClick={() => props.onChange(m.id)}
                  class="rounded-xl border border-border p-3 text-left transition-colors hover:bg-secondary"
                >
                  <Dynamic component={m.icon} class="h-4 w-4 text-primary" />
                  <p class="mt-2 text-sm font-semibold">{METHOD_LABEL[m.id]}</p>
                  <p class="text-xs text-muted-foreground">{m.blurb(props.currency)}</p>
                </button>
              )}
            </For>
          </div>
        }
      >
        {(m) => (
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary bg-primary/10 p-3">
            <div class="flex items-center gap-3">
              <Dynamic component={m().icon} class="h-4 w-4 text-primary" />
              <div>
                <p class="text-sm font-semibold">{METHOD_LABEL[m().id]}</p>
                <p class="text-xs text-muted-foreground">{m().blurb(props.currency)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => props.onChange(null)}
              class="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
            >
              <ChevronLeft class="h-3.5 w-3.5" /> Change
            </button>
          </div>
        )}
      </Show>
    </div>
  );
}

/** Name, email, country, and for mobile money the network and number. */
export function PayerFields(props: {
  currency: Currency;
  method: PayMethod;
  network: string;
  onNetwork: (code: string) => void;
  country: string;
  onCountry: (c: string) => void;
}) {
  const networks = () => networksFor(props.currency);
  const digits = () => momoNumberLength(props.currency, props.country);
  return (
    <div class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" for="payer_name">
          <input
            id="payer_name"
            name="payer_name"
            required
            autocomplete="name"
            class={INPUT_CLASS}
          />
        </Field>
        <Field label="Email for the receipt" for="payer_email">
          <input
            id="payer_email"
            name="payer_email"
            type="email"
            required
            autocomplete="email"
            class={INPUT_CLASS}
          />
        </Field>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <Field label="Your country" for="payer_country">
          <select
            id="payer_country"
            name="payer_country"
            class={SELECT_CLASS}
            value={props.country}
            onChange={(e) => props.onCountry(e.currentTarget.value)}
          >
            <For each={Object.entries(COUNTRY_NAMES)}>
              {([code, name]) => <option value={code}>{name}</option>}
            </For>
          </select>
        </Field>
        <Show when={props.method === "momo"}>
          <Field label="Mobile money network" for="network">
            <select
              id="network"
              name="network"
              class={SELECT_CLASS}
              value={props.network}
              onChange={(e) => props.onNetwork(e.currentTarget.value)}
            >
              <For each={networks()}>{(n) => <option value={n.code}>{n.name}</option>}</For>
            </select>
          </Field>
        </Show>
      </div>
      <Show when={props.method === "momo"}>
        <Field
          label="Mobile money number"
          for="payer_phone"
          hint={
            digits()
              ? `With the country code, ${digits()} digits, e.g. ${props.currency === "KES" ? "254712345678" : props.currency === "GHS" ? "233201234567" : "no + or spaces"}.`
              : "With the country code."
          }
        >
          <input
            id="payer_phone"
            name="payer_phone"
            type="tel"
            required
            inputmode="numeric"
            autocomplete="tel"
            class={INPUT_CLASS}
          />
        </Field>
      </Show>
      <Show when={props.method !== "momo"}>
        <Field label="Phone number" for="payer_phone" optional>
          <input
            id="payer_phone"
            name="payer_phone"
            type="tel"
            inputmode="numeric"
            autocomplete="tel"
            class={INPUT_CLASS}
          />
        </Field>
      </Show>
    </div>
  );
}

function copy(value: string, what: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${what} copied.`),
    () => toast.error(`Could not copy the ${what.toLowerCase()}.`),
  );
}

function Countdown(props: { until: string }) {
  const [left, setLeft] = createSignal(
    Math.max(0, Math.floor((new Date(props.until).getTime() - Date.now()) / 1000)),
  );
  onMount(() => {
    const t = setInterval(() => setLeft((s) => Math.max(s - 1, 0)), 1000);
    onCleanup(() => clearInterval(t));
  });
  return (
    <span class="font-semibold text-foreground">
      {String(Math.floor(left() / 60)).padStart(2, "0")}:{String(left() % 60).padStart(2, "0")}
    </span>
  );
}

/** Waiting on a mobile money prompt, with the XOF OTP step when Payaza asks for it. */
export function MomoWait(props: {
  payin: Extract<PayinDetails, { kind: "momo" }>;
  total: string;
  onOtp: (otp: string) => Promise<void>;
}) {
  const [otp, setOtp] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await props.onOtp(otp());
    } finally {
      setBusy(false);
    }
  }
  return (
    <div class="rounded-xl border border-border bg-surface/60 p-5 text-center">
      <Smartphone class="mx-auto h-8 w-8 animate-pulse text-primary" />
      <p class="mt-3 font-semibold">Approve {props.total} on your phone</p>
      <p class="mt-1 text-sm text-muted-foreground">
        We sent a request to <span class="font-mono text-foreground">{props.payin.phone}</span>.
        Enter your PIN when it appears. This page updates by itself.
      </p>
      <Show when={props.payin.beforeInstruction}>
        <p class="mt-3 whitespace-pre-line text-left text-xs text-muted-foreground">
          {props.payin.beforeInstruction}
        </p>
      </Show>
      <Show when={props.payin.redirectUrl}>
        <a
          href={props.payin.redirectUrl!}
          target="_blank"
          rel="noreferrer"
          class={`${BUTTON_PRIMARY} mt-4`}
        >
          Continue to complete the payment
        </a>
      </Show>
      <Show when={props.payin.requiresOtp && !props.payin.otpSubmitted}>
        <form onSubmit={submit} class="mx-auto mt-4 flex max-w-xs gap-2">
          <label for="otp" class="sr-only">
            Code from the SMS
          </label>
          <input
            id="otp"
            inputmode="numeric"
            required
            maxlength={props.payin.otpLength ?? 8}
            placeholder="Code from the SMS"
            value={otp()}
            onInput={(e) => setOtp(e.currentTarget.value)}
            class={`${INPUT_CLASS} text-center font-mono tracking-widest`}
          />
          <button type="submit" disabled={busy()} class={BUTTON_PRIMARY}>
            {busy() ? "…" : "Confirm"}
          </button>
        </form>
      </Show>
      <Show when={props.payin.otpSubmitted && props.payin.afterInstruction}>
        <p class="mt-3 text-xs text-muted-foreground">{props.payin.afterInstruction}</p>
      </Show>
    </div>
  );
}

/** One-off Nigerian bank account from Payaza, with the exact amount and expiry. */
export function VirtualAccountBox(props: {
  payin: Extract<PayinDetails, { kind: "virtual_account" }>;
  total: string;
}) {
  return (
    <div class="overflow-hidden rounded-xl border border-border text-center">
      <div class="bg-primary/10 p-4">
        <p class="text-xs text-muted-foreground">Transfer exactly</p>
        <p class="mt-1 flex items-center justify-center gap-2 font-display text-xl font-semibold">
          {props.total}
          <button
            type="button"
            onClick={() => copy(props.total.replace(/[^\d.]/g, ""), "Amount")}
            aria-label="Copy amount"
            class="rounded-md p-1 text-primary hover:bg-primary/10"
          >
            <Copy class="h-4 w-4" />
          </button>
        </p>
      </div>
      <div class="space-y-4 bg-surface/60 p-4">
        <div>
          <p class="text-xs text-muted-foreground">Bank</p>
          <p class="mt-1 text-sm font-semibold text-primary">{props.payin.bankName}</p>
        </div>
        <div>
          <p class="text-xs text-muted-foreground">Account number</p>
          <p class="mt-1 flex items-center justify-center gap-2 font-mono text-2xl font-semibold tracking-wider">
            {props.payin.accountNumber}
            <button
              type="button"
              onClick={() => copy(props.payin.accountNumber, "Account number")}
              aria-label="Copy account number"
              class="rounded-md p-1 text-primary hover:bg-primary/10"
            >
              <Copy class="h-4 w-4" />
            </button>
          </p>
        </div>
        <div>
          <p class="text-xs text-muted-foreground">Account name</p>
          <p class="mt-1 text-sm">{props.payin.accountName}</p>
        </div>
        <p class="text-xs text-muted-foreground">
          This account expires in <Countdown until={props.payin.expiresAt} />. We confirm the moment
          the transfer lands.
        </p>
      </div>
    </div>
  );
}

/* --------------------------- Payaza Web Checkout -------------------------- */

type PayazaCheckoutInstance = {
  setCallback(fn: (response: unknown) => void): void;
  setOnClose(fn: () => void): void;
  showPopup(): void;
};

declare global {
  interface Window {
    PayazaCheckout?: { setup(config: Record<string, unknown>): PayazaCheckoutInstance };
  }
}

const BUNDLE_URL = "https://checkout-v2.payaza.africa/js/v1/bundle.js";

function loadBundle(): Promise<void> {
  if (window.PayazaCheckout) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${BUNDLE_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("checkout failed to load")));
      return;
    }
    const s = document.createElement("script");
    s.src = BUNDLE_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("checkout failed to load"));
    document.head.appendChild(s);
  });
}

/**
 * Opens Payaza's hosted card checkout. The callback is only a hint to poll
 * sooner; the server confirms by webhook or status query before anything moves.
 */
export function CheckoutLauncher(props: {
  payin: Extract<PayinDetails, { kind: "checkout" }>;
  onHint: () => void;
}) {
  const [state, setState] = createSignal<"loading" | "ready" | "open" | "closed" | "error">(
    "loading",
  );

  async function open() {
    try {
      await loadBundle();
      const checkout = window.PayazaCheckout!.setup({
        merchant_key: props.payin.merchantKey,
        connection_mode: props.payin.connectionMode,
        checkout_amount: Number(props.payin.amount),
        currency_code: props.payin.currency,
        email_address: props.payin.email,
        first_name: props.payin.firstName,
        last_name: props.payin.lastName,
        phone_number: props.payin.phone,
        transaction_reference: props.payin.reference,
        additional_details: { meridian_reference: props.payin.reference },
      });
      checkout.setCallback(() => {
        setState("closed");
        props.onHint();
      });
      checkout.setOnClose(() => {
        setState("closed");
        props.onHint();
      });
      setState("open");
      checkout.showPopup();
    } catch {
      setState("error");
      toast.error("Payaza's checkout did not load. Check your connection and try again.");
    }
  }

  onMount(() => {
    void open();
  });

  return (
    <div class="rounded-xl border border-border bg-surface/60 p-5 text-center">
      <CreditCard class="mx-auto h-8 w-8 text-primary" />
      <p class="mt-3 font-semibold">Card details are entered on Payaza's secure page</p>
      <p class="mt-1 text-sm text-muted-foreground">
        Meridian never sees your card number. When you finish, this page updates by itself.
      </p>
      <Switch>
        <Match when={state() === "loading"}>
          <p class="mt-4 text-xs text-muted-foreground">Opening Payaza checkout…</p>
        </Match>
        <Match when={state() === "closed" || state() === "error"}>
          <button type="button" onClick={() => void open()} class={`${BUTTON_SECONDARY} mt-4`}>
            Open the checkout again
          </button>
        </Match>
      </Switch>
    </div>
  );
}
