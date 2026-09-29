import { Title } from "@solidjs/meta";
import { A, createAsync, query, revalidate, type RouteDefinition } from "@solidjs/router";
import Copy from "lucide-solid/icons/copy";
import ExternalLink from "lucide-solid/icons/external-link";
import Mail from "lucide-solid/icons/mail";
import MessageCircle from "lucide-solid/icons/message-circle";
import { For, Show, Suspense, createSignal } from "solid-js";

import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  Field,
  INPUT_CLASS,
  Notice,
  SELECT_CLASS,
} from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { CURRENCY_CODES, formatMoney, type Currency } from "~/lib/fees";
import { requestableCurrencies } from "~/lib/request-edit";
import { paymentRequestSchema } from "~/lib/schemas";
import { createPaymentRequest, getMyBusiness, listPayoutAccounts } from "~/server/business-actions";

const loadBusiness = query(() => getMyBusiness(), "my-business");
const loadAccounts = query(() => listPayoutAccounts(), "payout-accounts");

export const route = {
  preload: () => {
    void loadBusiness();
    void loadAccounts();
  },
} satisfies RouteDefinition;

function randomKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export default function NewRequest() {
  const business = createAsync(() => loadBusiness());
  const accounts = createAsync(() => loadAccounts());
  const [busy, setBusy] = createSignal(false);
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  // One key per form render. A double click sends the same key and gets the same request back.
  const [idempotencyKey, setIdempotencyKey] = createSignal(randomKey());
  const [created, setCreated] = createSignal<{
    reference: string;
    url: string;
    amount: string;
    invoice: string | null;
  } | null>(null);
  // Only currencies the business can be paid out in: Payaza doesn't convert.
  const currencies = () => requestableCurrencies(accounts() ?? [], CURRENCY_CODES);
  const [picked, setPicked] = createSignal<Currency | null>(null);
  const cur = (): Currency => {
    const p = picked();
    return p && currencies().includes(p) ? p : (currencies()[0] ?? "KES");
  };
  const setCur = (c: Currency) => setPicked(c);

  async function create(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      idempotency_key: idempotencyKey(),
      amount: Number(fd.get("amount")),
      currency: cur(),
      invoice_number: String(fd.get("invoice_number") ?? ""),
      memo: String(fd.get("memo") ?? ""),
      payer_email: String(fd.get("payer_email") ?? ""),
      usage: String(fd.get("usage") ?? "single") as "single" | "multi",
      expires_in_days: Number(fd.get("expires_in_days") ?? 0),
    };
    const parsed = paymentRequestSchema.safeParse(input);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const r = await createPaymentRequest(parsed.data);
      if (!r.ok) return toast.error(r.error);
      setCreated({
        reference: r.request.reference,
        url: r.url,
        amount: formatMoney(Number(r.request.amount), r.request.currency as Currency),
        invoice: r.request.invoice_number,
      });
      setIdempotencyKey(randomKey());
      await revalidate("dashboard");
      toast.success("Payment request created.");
    } catch {
      toast.error("Could not create the request.");
    } finally {
      setBusy(false);
    }
  }

  function copy(value: string) {
    navigator.clipboard.writeText(value).then(
      () => toast.success("Link copied."),
      () => toast.error("Could not copy."),
    );
  }

  const shareText = () => {
    const c = created();
    if (!c) return "";
    const who = business()?.trading_name || business()?.name || "We";
    return `${who} requests ${c.amount}${c.invoice ? ` for invoice ${c.invoice}` : ""}. Pay here: ${c.url} (ref ${c.reference})`;
  };

  return (
    <main class="mx-auto max-w-2xl px-5 py-10">
      <Title>New payment request — Meridian</Title>
      <h1 class="font-display text-3xl font-bold">New payment request</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        Enter the amount you want to receive. The payer covers the fees on top, so you get exactly
        this.
      </p>

      <Suspense fallback={<p class="mt-8 text-sm text-muted-foreground">Loading…</p>}>
        <Show
          when={business()}
          fallback={
            <div class="mt-8">
              <Notice tone="warning">
                Set up your{" "}
                <A href="/app/onboarding" class="font-semibold underline">
                  business profile
                </A>{" "}
                first.
              </Notice>
            </div>
          }
        >
          <Show
            when={currencies().length > 0}
            fallback={
              <div class="mt-8">
                <Notice tone="warning">
                  Add a{" "}
                  <A href="/app/settings/payout-accounts" class="font-semibold underline">
                    payout account
                  </A>{" "}
                  first. You can request payment in the currencies you have payout accounts in,
                  because Payaza pays out only in the currency your payer pays in.
                </Notice>
              </div>
            }
          >
            <Show
              when={created()}
              fallback={
                <form onSubmit={create} class="panel mt-8 space-y-5 p-6">
                  <div class="grid gap-5 sm:grid-cols-[1fr_140px]">
                    <Field label="Amount you receive" for="amount" error={errors()["amount"]}>
                      <input
                        id="amount"
                        name="amount"
                        type="number"
                        inputmode="decimal"
                        min="0.01"
                        step="0.01"
                        required
                        class={INPUT_CLASS}
                      />
                    </Field>
                    <Field label="Currency" for="currency">
                      <select
                        id="currency"
                        class={SELECT_CLASS}
                        value={cur()}
                        onChange={(e) => setCur(e.currentTarget.value as Currency)}
                      >
                        <For each={currencies()}>{(c) => <option value={c}>{c}</option>}</For>
                      </select>
                    </Field>
                  </div>
                  <p class="-mt-2 text-xs text-muted-foreground">
                    Only the currencies you have{" "}
                    <A href="/app/settings/payout-accounts" class="underline">
                      payout accounts
                    </A>{" "}
                    in. Your payer pays in this currency, and Payaza pays you out in it; it doesn't
                    convert between currencies.
                  </p>
                  <Field
                    label="Your invoice number"
                    for="invoice_number"
                    optional
                    hint="Shown on the pay page and both receipts. Searchable."
                    error={errors()["invoice_number"]}
                  >
                    <input
                      id="invoice_number"
                      name="invoice_number"
                      placeholder="e.g. AF-0917"
                      class={INPUT_CLASS}
                    />
                  </Field>
                  <Field label="Note to the payer" for="memo" optional error={errors()["memo"]}>
                    <input
                      id="memo"
                      name="memo"
                      placeholder="e.g. Roses, 40 boxes, week 39"
                      class={INPUT_CLASS}
                    />
                  </Field>
                  <div class="grid gap-5 sm:grid-cols-2">
                    <Field
                      label="Payer's email"
                      for="payer_email"
                      optional
                      hint="We email them the link."
                      error={errors()["payer_email"]}
                    >
                      <input id="payer_email" name="payer_email" type="email" class={INPUT_CLASS} />
                    </Field>
                    <Field label="Link expires" for="expires_in_days">
                      <select id="expires_in_days" name="expires_in_days" class={SELECT_CLASS}>
                        <option value="0">Never</option>
                        <option value="7">In 7 days</option>
                        <option value="30">In 30 days</option>
                        <option value="90">In 90 days</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="How many times can it be paid?" for="usage">
                    <select id="usage" name="usage" class={SELECT_CLASS}>
                      <option value="single">Once (an invoice)</option>
                      <option value="multi">
                        Many times (a standing price, e.g. a course or event)
                      </option>
                    </select>
                  </Field>
                  <div class="flex justify-end pt-2">
                    <button type="submit" disabled={busy()} class={BUTTON_PRIMARY}>
                      {busy() ? "Creating…" : "Create payment link"}
                    </button>
                  </div>
                </form>
              }
            >
              {(c) => (
                <div class="panel mt-8 space-y-5 p-6">
                  <div>
                    <p class="text-xs uppercase tracking-widest text-muted-foreground">
                      Payment link
                    </p>
                    <h2 class="mt-1 font-display text-2xl font-bold">{c().amount}</h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                      <Show when={c().invoice}>Invoice {c().invoice} · </Show>
                      <span class="font-mono text-primary">{c().reference}</span>
                    </p>
                  </div>
                  <div class="flex items-center gap-2 rounded-xl border border-border bg-surface/60 p-3">
                    <input
                      readOnly
                      aria-label="Payment link"
                      value={c().url}
                      class="flex-1 bg-transparent font-mono text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => copy(c().url)}
                      class={BUTTON_SECONDARY}
                      aria-label="Copy link"
                    >
                      <Copy class="h-4 w-4" />
                    </button>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(shareText())}`}
                      target="_blank"
                      rel="noreferrer"
                      class={BUTTON_SECONDARY}
                    >
                      <MessageCircle class="h-4 w-4" /> WhatsApp
                    </a>
                    <a
                      href={`mailto:?subject=${encodeURIComponent(`Payment request ${c().reference}`)}&body=${encodeURIComponent(shareText())}`}
                      class={BUTTON_SECONDARY}
                    >
                      <Mail class="h-4 w-4" /> Email
                    </a>
                    <a href={c().url} target="_blank" rel="noreferrer" class={BUTTON_SECONDARY}>
                      <ExternalLink class="h-4 w-4" /> Open pay page
                    </a>
                  </div>
                  <div class="flex flex-wrap justify-between gap-2 pt-2">
                    <A
                      href={`/app/collect/${c().reference}`}
                      class="text-sm text-primary hover:underline"
                    >
                      Track this request
                    </A>
                    <button
                      type="button"
                      onClick={() => setCreated(null)}
                      class="text-sm text-muted-foreground hover:text-foreground"
                    >
                      Create another
                    </button>
                  </div>
                </div>
              )}
            </Show>
          </Show>
        </Show>
      </Suspense>
    </main>
  );
}
