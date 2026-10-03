import { Title } from "@solidjs/meta";
import { createAsync, query, revalidate, type RouteDefinition } from "@solidjs/router";
import Plus from "lucide-solid/icons/plus";
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";

import { FallbackNote, RouteQuotes, RoutedPayinBox, countryName } from "~/components/routing";
import { TransactionBadge } from "~/components/status";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  INPUT_CLASS,
  Notice,
  SELECT_CLASS,
} from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { formatMoney } from "~/lib/fees";
import { RAIL_LABEL, type Rail } from "~/lib/providers";
import type { PricedPlan } from "~/server/money/routed";
import type { PayinInstructions } from "~/server/partners/adapters";
import {
  getSendSetup,
  getTransfer,
  listRecipients,
  listTransfers,
  quoteSend,
  sandboxFundTransfer,
  saveRecipient,
  sendMoney,
  type TransferView,
} from "~/server/transfer-actions";

const loadSetup = query(() => getSendSetup(), "send-setup");
const loadRecipients = query(() => listRecipients(), "recipients");
const loadTransfers = query(() => listTransfers(), "transfers");

export const route = {
  preload: () => {
    void loadSetup();
    void loadRecipients();
    void loadTransfers();
  },
} satisfies RouteDefinition;

function randomKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

const DONE = ["settled", "failed", "refunded", "blocked"];

export default function SendMoney() {
  const setup = createAsync(() => loadSetup());
  const recipients = createAsync(() => loadRecipients());
  const transfers = createAsync(() => loadTransfers());

  const [recipientId, setRecipientId] = createSignal("");
  const [adding, setAdding] = createSignal(false);
  const [amount, setAmount] = createSignal("");
  const [funder, setFunder] = createSignal("");
  const [plan, setPlan] = createSignal<PricedPlan | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [transfer, setTransfer] = createSignal<TransferView | null>(null);
  const [key, setKey] = createSignal(randomKey());

  const recipient = () => recipients()?.find((r) => r.id === recipientId()) ?? null;
  const funders = () => setup()?.funders ?? [];
  const funderValue = () =>
    funder() || (funders()[0] ? `${funders()[0]!.currency}|${funders()[0]!.rail}` : "");
  const from = () => {
    const [currency, rail] = funderValue().split("|");
    return { currency: currency ?? "", rail: (rail ?? "momo") as Rail };
  };

  // A changed input invalidates the prices shown.
  createEffect(() => {
    recipientId();
    amount();
    funderValue();
    setPlan(null);
    setError("");
  });

  async function compare() {
    const r = recipient();
    const n = Number(amount());
    if (!r) {
      setError("Pick a recipient.");
      return;
    }
    if (!(n > 0)) {
      setError("Enter how much the recipient should get.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await quoteSend({
      recipient_id: r.id,
      from_currency: from().currency,
      from_rail: from().rail,
      amount: n,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.plan.quotes.length === 0) {
      setError(
        `No provider can pay ${r.currency} in ${countryName(r.country)} from ${from().currency} ${RAIL_LABEL[from().rail].toLowerCase()}. Try paying from another currency.`,
      );
      return;
    }
    setPlan(res.plan);
  }

  async function send() {
    const r = recipient();
    if (!r) return;
    setBusy(true);
    const res = await sendMoney({
      recipient_id: r.id,
      from_currency: from().currency,
      from_rail: from().rail,
      amount: Number(amount()),
      idempotency_key: key(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setKey(randomKey());
      void revalidate(loadTransfers.key);
      return;
    }
    setTransfer(res.transfer);
    setKey(randomKey());
    void revalidate(loadTransfers.key);
  }

  // Follow the open transfer until it lands or fails.
  createEffect(() => {
    const t = transfer();
    if (!t || DONE.includes(t.status)) return;
    const timer = setInterval(async () => {
      const next = await getTransfer(t.id);
      if (next) setTransfer(next);
      if (next && DONE.includes(next.status)) void revalidate(loadTransfers.key);
    }, 3000);
    onCleanup(() => clearInterval(timer));
  });

  async function simulate() {
    const t = transfer();
    if (!t) return;
    setBusy(true);
    const res = await sandboxFundTransfer(t.id);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    const next = await getTransfer(t.id);
    if (next) setTransfer(next);
    void revalidate(loadTransfers.key);
  }

  return (
    <main class="mx-auto max-w-6xl px-5 py-8">
      <Title>Send money · Meridian</Title>
      <h1 class="font-display text-2xl font-semibold">Send money</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        Pay a supplier anywhere we reach: across Africa in local currency, or abroad in EUR, USD,
        JPY, CNY and more. We ask every provider for a price and use the cheapest. If it is down,
        the next cheapest takes over.
      </p>

      <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section class="space-y-4 rounded-2xl border border-border p-5">
          <Show
            when={!transfer()}
            fallback={
              <TransferPanel
                transfer={transfer()!}
                busy={busy()}
                onSimulate={simulate}
                onNew={() => {
                  setTransfer(null);
                  setPlan(null);
                  setAmount("");
                }}
              />
            }
          >
            <div class="flex items-center gap-2">
              <select
                aria-label="Recipient"
                class={SELECT_CLASS}
                value={recipientId()}
                onChange={(e) => setRecipientId(e.currentTarget.value)}
              >
                <option value="">Who are you paying?</option>
                <For each={recipients() ?? []}>
                  {(r) => (
                    <option value={r.id}>
                      {r.name} · {r.currency} · {countryName(r.country)}
                    </option>
                  )}
                </For>
              </select>
              <button type="button" class={BUTTON_SECONDARY} onClick={() => setAdding(!adding())}>
                <Plus class="h-4 w-4" /> New
              </button>
            </div>

            <Show when={adding()}>
              <RecipientForm
                destinations={setup()?.destinations ?? []}
                onSaved={(id) => {
                  setAdding(false);
                  void revalidate(loadRecipients.key).then(() => setRecipientId(id));
                }}
              />
            </Show>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="relative">
                <input
                  aria-label="Amount the recipient gets"
                  class={INPUT_CLASS}
                  inputmode="decimal"
                  placeholder={`Amount they get${recipient() ? ` (${recipient()!.currency})` : ""}`}
                  value={amount()}
                  onInput={(e) => setAmount(e.currentTarget.value.replace(/[^\d.]/g, ""))}
                />
              </div>
              <select
                aria-label="Pay from"
                class={SELECT_CLASS}
                value={funderValue()}
                onChange={(e) => setFunder(e.currentTarget.value)}
              >
                <For each={funders()}>
                  {(f) => (
                    <option value={`${f.currency}|${f.rail}`}>
                      Pay from {f.currency} · {RAIL_LABEL[f.rail]}
                    </option>
                  )}
                </For>
              </select>
            </div>

            <Show when={error()}>
              <Notice tone="danger">{error()}</Notice>
            </Show>

            <Show
              when={plan()}
              fallback={
                <button type="button" class={BUTTON_PRIMARY} disabled={busy()} onClick={compare}>
                  {busy() ? "Asking providers…" : "Compare prices"}
                </button>
              }
            >
              {(p) => (
                <>
                  <RouteQuotes plan={p()} />
                  <button type="button" class={BUTTON_PRIMARY} disabled={busy()} onClick={send}>
                    {busy()
                      ? "Starting…"
                      : `Send ${formatMoney(Number(amount()), recipient()?.currency ?? "")} with ${p().quotes[0]?.providerName}`}
                  </button>
                </>
              )}
            </Show>
          </Show>
        </section>

        <aside class="space-y-3">
          <h2 class="text-sm font-semibold">Recent transfers</h2>
          <Show
            when={(transfers() ?? []).length > 0}
            fallback={<p class="text-sm text-muted-foreground">No transfers yet.</p>}
          >
            <ul class="space-y-2" data-testid="transfer-list">
              <For each={transfers()}>
                {(t) => (
                  <li class="rounded-xl border border-border px-3 py-2 text-sm">
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-semibold">{t.recipientName}</span>
                      <TransactionBadge status={t.status} />
                    </div>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {formatMoney(t.receiveAmount, t.receiveCurrency)} · {t.providerName ?? "—"} ·{" "}
                      <span class="font-mono">{t.reference}</span>
                    </p>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </aside>
      </div>
    </main>
  );
}

function TransferPanel(props: {
  transfer: TransferView;
  busy: boolean;
  onSimulate: () => void;
  onNew: () => void;
}) {
  const t = () => props.transfer;
  return (
    <div class="space-y-4" data-testid="transfer-panel">
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-sm font-semibold">
            {formatMoney(t().receiveAmount, t().receiveCurrency)} to {t().recipientName}
          </p>
          <p class="font-mono text-xs text-muted-foreground">{t().reference}</p>
        </div>
        <TransactionBadge status={t().status} />
      </div>
      <FallbackNote attempts={t().attempts} />
      <Show when={t().status === "awaiting_payin" && t().payin}>
        <RoutedPayinBox payin={t().payin as PayinInstructions} providerName={t().providerName} />
        <Show when={t().sandbox}>
          <button
            type="button"
            class={BUTTON_SECONDARY}
            disabled={props.busy}
            onClick={() => props.onSimulate()}
          >
            {props.busy ? "Playing the payment…" : "Simulate my payment (sandbox)"}
          </button>
        </Show>
      </Show>
      <Show when={t().status === "settled"}>
        <Notice tone="success">
          {t().recipientName} has been paid {formatMoney(t().receiveAmount, t().receiveCurrency)}{" "}
          through {t().providerName}.
          {t().payoutSimulated ? " Sandbox: the payout was simulated." : ""}
        </Notice>
      </Show>
      <Show when={t().status === "paying_out"}>
        <Notice>
          {t().providerName} is paying {t().recipientName}. We confirm when it lands.
        </Notice>
      </Show>
      <Show when={t().status === "failed"}>
        <Notice tone="danger">{t().failureReason ?? "This transfer failed."}</Notice>
      </Show>
      <dl class="grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
        <dt>Recipient gets</dt>
        <dd class="text-right">{formatMoney(t().receiveAmount, t().receiveCurrency)}</dd>
        <dt>Provider cost</dt>
        <dd class="text-right">{formatMoney(t().providerFee, t().sendCurrency)}</dd>
        <dt>Meridian (1%)</dt>
        <dd class="text-right">{formatMoney(t().meridianFee, t().sendCurrency)}</dd>
        <dt class="font-semibold text-foreground">You pay</dt>
        <dd class="text-right font-semibold text-foreground">
          {formatMoney(t().total, t().sendCurrency)}
        </dd>
      </dl>
      <button type="button" class={BUTTON_SECONDARY} onClick={() => props.onNew()}>
        Send another
      </button>
    </div>
  );
}

function RecipientForm(props: {
  destinations: { currency: string; country: string; rails: Rail[] }[];
  onSaved: (id: string) => void;
}) {
  const countries = createMemo(() =>
    [...new Set(props.destinations.map((d) => d.country))].sort((a, b) =>
      countryName(a).localeCompare(countryName(b)),
    ),
  );
  const [country, setCountry] = createSignal("");
  const [currency, setCurrency] = createSignal("");
  const [method, setMethod] = createSignal<"momo" | "bank" | "wallet">("bank");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const options = () => props.destinations.filter((d) => d.country === country());
  const cur = () =>
    options().some((o) => o.currency === currency()) ? currency() : (options()[0]?.currency ?? "");
  const rails = () =>
    (options().find((o) => o.currency === cur())?.rails ?? []).filter(
      (r): r is "momo" | "bank" | "wallet" => r === "momo" || r === "bank" || r === "wallet",
    );
  const rail = () => (rails().includes(method()) ? method() : (rails()[0] ?? "bank"));
  const abroad = () =>
    ![
      "KE",
      "NG",
      "GH",
      "ZA",
      "UG",
      "TZ",
      "ZM",
      "RW",
      "CM",
      "CI",
      "SN",
      "BJ",
      "ET",
      "CD",
      "SL",
      "LR",
    ].includes(country());

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const s = (k: string) => String(f.get(k) ?? "");
    setBusy(true);
    setError("");
    const res = await saveRecipient({
      name: s("name"),
      country: country(),
      currency: cur(),
      method: rail(),
      account_number: s("account_number"),
      bank_name: s("bank_name"),
      bank_code: s("bank_code"),
      network: s("network"),
      swift_code: s("swift_code"),
      iban: s("iban"),
      address: s("address"),
      email: s("email"),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(`${res.recipient.name} saved.`);
    props.onSaved(res.recipient.id);
  }

  return (
    <form
      class="space-y-3 rounded-xl border border-dashed border-border p-4"
      onSubmit={onSubmit}
      data-testid="recipient-form"
    >
      <input
        name="name"
        aria-label="Recipient name"
        class={INPUT_CLASS}
        placeholder="Recipient's full or business name"
        required
      />
      <div class="grid gap-3 sm:grid-cols-3">
        <select
          aria-label="Country"
          class={SELECT_CLASS}
          value={country()}
          onChange={(e) => setCountry(e.currentTarget.value)}
          required
        >
          <option value="">Country</option>
          <For each={countries()}>{(c) => <option value={c}>{countryName(c)}</option>}</For>
        </select>
        <select
          aria-label="Currency"
          class={SELECT_CLASS}
          value={cur()}
          onChange={(e) => setCurrency(e.currentTarget.value)}
        >
          <For each={options()}>{(o) => <option value={o.currency}>{o.currency}</option>}</For>
        </select>
        <select
          aria-label="Paid by"
          class={SELECT_CLASS}
          value={rail()}
          onChange={(e) => setMethod(e.currentTarget.value as "momo" | "bank" | "wallet")}
        >
          <For each={rails()}>{(r) => <option value={r}>{RAIL_LABEL[r]}</option>}</For>
        </select>
      </div>
      <input
        name="account_number"
        aria-label="Account number"
        class={INPUT_CLASS}
        placeholder={
          rail() === "momo"
            ? "Mobile money number, e.g. 254712345678"
            : rail() === "wallet"
              ? "Alipay or WeChat ID"
              : "Account number or IBAN"
        }
        required
      />
      <Show when={rail() === "momo"}>
        <input
          name="network"
          aria-label="Network"
          class={INPUT_CLASS}
          placeholder="Network, e.g. MPESA, MTN"
        />
      </Show>
      <Show when={rail() === "bank"}>
        <div class="grid gap-3 sm:grid-cols-2">
          <input
            name="bank_name"
            aria-label="Bank name"
            class={INPUT_CLASS}
            placeholder="Bank name"
          />
          <Show
            when={abroad()}
            fallback={
              <input
                name="bank_code"
                aria-label="Bank code"
                class={INPUT_CLASS}
                placeholder="Bank code (optional)"
              />
            }
          >
            <input
              name="swift_code"
              aria-label="SWIFT code"
              class={INPUT_CLASS}
              placeholder="SWIFT / BIC code"
            />
          </Show>
        </div>
        <Show when={abroad()}>
          <input
            name="iban"
            aria-label="IBAN"
            class={INPUT_CLASS}
            placeholder="IBAN (Europe; optional elsewhere)"
          />
          <input
            name="address"
            aria-label="Address"
            class={INPUT_CLASS}
            placeholder="Recipient's address (needed for international wires)"
          />
        </Show>
      </Show>
      <input
        name="email"
        type="email"
        aria-label="Email"
        class={INPUT_CLASS}
        placeholder="Recipient's email for the receipt (optional)"
      />
      <Show when={error()}>
        <Notice tone="danger">{error()}</Notice>
      </Show>
      <button type="submit" class={BUTTON_PRIMARY} disabled={busy() || !country()}>
        {busy() ? "Saving…" : "Save recipient"}
      </button>
    </form>
  );
}
