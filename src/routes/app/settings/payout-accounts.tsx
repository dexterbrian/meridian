import { Title } from "@solidjs/meta";
import { A, createAsync, query, revalidate, type RouteDefinition } from "@solidjs/router";
import Pencil from "lucide-solid/icons/pencil";
import ShieldCheck from "lucide-solid/icons/shield-check";
import { For, Show, Suspense, createMemo, createSignal } from "solid-js";

import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  Field,
  INPUT_CLASS,
  Notice,
  SELECT_CLASS,
} from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { PAYOUT_CURRENCIES, currency as currencyInfo, type Currency } from "~/lib/fees";
import { COUNTRY_NAMES, networksFor, payoutMethodsFor } from "~/lib/payaza-codes";
import { payoutAccountSchema } from "~/lib/schemas";
import {
  getMyBusiness,
  listPayoutAccounts,
  savePayoutAccount,
  setDefaultPayoutAccount,
  type NameCheck,
  type PayoutAccount,
} from "~/server/business-actions";

const loadAccounts = query(() => listPayoutAccounts(), "payout-accounts");
const loadBusiness = query(() => getMyBusiness(), "my-business");

export const route = {
  preload: () => {
    void loadAccounts();
    void loadBusiness();
  },
} satisfies RouteDefinition;

type Details = {
  bank_code?: string;
  bank_name?: string;
  account_number?: string;
  account_name?: string;
};

export default function PayoutAccounts() {
  const accounts = createAsync(() => loadAccounts());
  const business = createAsync(() => loadBusiness());
  const [busy, setBusy] = createSignal(false);
  const [check, setCheck] = createSignal<NameCheck | null>(null);
  const [cur, setCur] = createSignal<Currency>("KES");
  const [method, setMethod] = createSignal<"momo" | "bank">("momo");
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  /** The account being edited, or null when adding a new one. */
  const [editing, setEditing] = createSignal<PayoutAccount | null>(null);
  let formRef: HTMLFormElement | undefined;

  const methods = createMemo(() => payoutMethodsFor(cur()));
  const networks = createMemo(() => networksFor(cur()));
  const countries = createMemo(() => currencyInfo(cur()).countries);
  const effectiveMethod = createMemo(() =>
    methods().includes(method()) ? method() : (methods()[0] ?? "momo"),
  );
  const details = () => (editing()?.details ?? {}) as Details;

  function startEdit(a: PayoutAccount) {
    setEditing(a);
    setCur(a.currency as Currency);
    setMethod(a.method as "momo" | "bank");
    setErrors({});
    setCheck(null);
    formRef?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setEditing(null);
    setErrors({});
    setCheck(null);
    formRef?.reset();
  }

  async function makeDefault(a: PayoutAccount) {
    setBusy(true);
    try {
      const r = await setDefaultPayoutAccount(a.id);
      if (!r.ok) return toast.error(r.error);
      await revalidate(["payout-accounts", "dashboard"]);
      toast.success(`${a.currency} payouts now go to this account.`);
    } finally {
      setBusy(false);
    }
  }

  async function save(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const input = {
      ...(editing() ? { id: editing()!.id } : {}),
      currency: cur(),
      country: String(fd.get("country") ?? ""),
      method: effectiveMethod(),
      bank_code: String(fd.get("bank_code") ?? ""),
      bank_name: String(fd.get("bank_name") ?? ""),
      account_number: String(fd.get("account_number") ?? ""),
      account_name: String(fd.get("account_name") ?? ""),
    };
    const parsed = payoutAccountSchema.safeParse(input);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    setCheck(null);
    try {
      const r = await savePayoutAccount(input);
      if (!r.ok) return toast.error(r.error);
      setCheck(r.check);
      await revalidate(["payout-accounts", "dashboard"]);
      toast.success(editing() ? "Payout account updated." : `${cur()} payout account added.`);
      setEditing(null);
      form.reset();
    } catch {
      toast.error("Could not save the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-3xl px-5 py-10">
      <Title>Payout accounts — Meridian</Title>
      <h1 class="font-display text-3xl font-bold">Payout accounts</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        Where Meridian pays you. Add as many as you like, in any currency Payaza pays out in. In
        each currency, payouts go to the account marked default. The name on every account is
        checked and must match your business.
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
          <section class="mt-8 space-y-3">
            <For
              each={accounts()}
              fallback={<p class="text-sm text-muted-foreground">No payout accounts yet.</p>}
            >
              {(a) => {
                const d = a.details as Details;
                return (
                  <div
                    class={`panel flex flex-wrap items-center justify-between gap-3 p-4 ${
                      editing()?.id === a.id ? "ring-2 ring-primary/60" : ""
                    }`}
                  >
                    <div>
                      <p class="flex flex-wrap items-center gap-2 font-semibold">
                        {a.currency} · {a.method === "momo" ? "Mobile money" : "Bank account"} ·{" "}
                        {d.bank_name ?? d.bank_code}
                        <Show when={a.is_default}>
                          <span class="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
                            Default
                          </span>
                        </Show>
                      </p>
                      <p class="font-mono text-sm text-muted-foreground">
                        {d.account_number} · {d.account_name}
                      </p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <span
                        class={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          a.validated
                            ? "border-success/40 bg-success/15 text-success"
                            : "border-warning/50 bg-warning/15 text-warning"
                        }`}
                      >
                        <ShieldCheck class="h-3.5 w-3.5" />
                        {a.validated ? "Name verified" : "Name not matched"}
                      </span>
                      <Show when={!a.is_default}>
                        <button
                          type="button"
                          disabled={busy()}
                          onClick={() => makeDefault(a)}
                          class={BUTTON_SECONDARY}
                        >
                          Make default
                        </button>
                      </Show>
                      <button
                        type="button"
                        onClick={() => startEdit(a)}
                        class={BUTTON_SECONDARY}
                        aria-label={`Edit ${a.currency} ${d.bank_name ?? ""} account`}
                      >
                        <Pencil class="h-4 w-4" /> Edit
                      </button>
                    </div>
                  </div>
                );
              }}
            </For>
          </section>

          <form
            ref={(el) => (formRef = el)}
            onSubmit={save}
            class="panel mt-8 scroll-mt-20 space-y-5 p-6"
          >
            <h2 class="font-semibold">
              {editing() ? `Edit ${editing()!.currency} account` : "Add an account"}
            </h2>
            <div class="grid gap-5 sm:grid-cols-2">
              <Field
                label="Currency"
                for="currency"
                hint={
                  editing()
                    ? "Fixed once an account exists. Add a new account for another currency."
                    : undefined
                }
              >
                <select
                  id="currency"
                  class={SELECT_CLASS}
                  value={cur()}
                  disabled={!!editing()}
                  onChange={(e) => setCur(e.currentTarget.value as Currency)}
                >
                  <For each={PAYOUT_CURRENCIES}>
                    {(c) => (
                      <option value={c}>
                        {c} · {currencyInfo(c).name}
                      </option>
                    )}
                  </For>
                </select>
              </Field>
              <Field label="Country" for="country" error={errors()["country"]}>
                <select
                  id="country"
                  name="country"
                  class={SELECT_CLASS}
                  value={editing()?.country ?? countries()[0]}
                >
                  <For each={countries()}>
                    {(c) => <option value={c}>{COUNTRY_NAMES[c] ?? c}</option>}
                  </For>
                </select>
              </Field>
            </div>
            <Field label="Account type" for="method">
              <div id="method" role="radiogroup" class="flex gap-2">
                <For each={methods()}>
                  {(m) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={effectiveMethod() === m}
                      onClick={() => setMethod(m)}
                      class={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
                        effectiveMethod() === m
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border hover:bg-secondary"
                      }`}
                    >
                      {m === "momo" ? "Mobile money" : "Bank account"}
                    </button>
                  )}
                </For>
              </div>
            </Field>
            <Show
              when={effectiveMethod() === "momo"}
              fallback={
                <div class="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Bank code"
                    for="bank_code"
                    hint="Payaza's code for the bank."
                    error={errors()["bank_code"]}
                  >
                    <input
                      id="bank_code"
                      name="bank_code"
                      value={editing()?.method === "bank" ? (details().bank_code ?? "") : ""}
                      class={INPUT_CLASS}
                    />
                  </Field>
                  <Field label="Bank name" for="bank_name" error={errors()["bank_name"]}>
                    <input
                      id="bank_name"
                      name="bank_name"
                      value={editing()?.method === "bank" ? (details().bank_name ?? "") : ""}
                      class={INPUT_CLASS}
                    />
                  </Field>
                </div>
              }
            >
              <Field label="Network" for="bank_code" error={errors()["bank_code"]}>
                <select
                  id="bank_code"
                  name="bank_code"
                  class={SELECT_CLASS}
                  value={editing()?.method === "momo" ? (details().bank_code ?? "") : undefined}
                >
                  <For each={networks()}>
                    {(n) => (
                      <option value={n.code}>
                        {n.name}
                        {n.confirmed ? "" : " (code to confirm with Payaza)"}
                      </option>
                    )}
                  </For>
                </select>
              </Field>
            </Show>
            <div class="grid gap-5 sm:grid-cols-2">
              <Field
                label={effectiveMethod() === "momo" ? "Mobile money number" : "Account number"}
                for="account_number"
                hint={
                  effectiveMethod() === "momo"
                    ? "With the country code, e.g. 254712345678."
                    : undefined
                }
                error={errors()["account_number"]}
              >
                <input
                  id="account_number"
                  name="account_number"
                  inputmode="numeric"
                  value={details().account_number ?? ""}
                  class={INPUT_CLASS}
                />
              </Field>
              <Field
                label="Account holder name"
                for="account_name"
                hint="Must match the business name."
                error={errors()["account_name"]}
              >
                <input
                  id="account_name"
                  name="account_name"
                  value={details().account_name ?? business()?.name ?? ""}
                  class={INPUT_CLASS}
                />
              </Field>
            </div>
            <Show when={check()}>
              {(c) => (
                <Notice tone={c().matches ? "success" : c().enforced ? "danger" : "warning"}>
                  <Show
                    when={c().resolvedName}
                    fallback={<>Payaza did not return a name for this account.</>}
                  >
                    Payaza says this account belongs to <strong>{c().resolvedName}</strong>.{" "}
                    {c().matches
                      ? "That matches your business."
                      : "That does not match your business name."}
                  </Show>
                  <Show when={!c().enforced && !c().matches}>
                    {" "}
                    In sandbox mode Payaza returns a test name for every account, so the account was
                    saved anyway. Live mode enforces the match.
                  </Show>
                </Notice>
              )}
            </Show>
            <div class="flex flex-wrap justify-end gap-2">
              <Show when={editing()}>
                <button type="button" onClick={cancelEdit} class={BUTTON_SECONDARY}>
                  Cancel
                </button>
              </Show>
              <button type="submit" disabled={busy()} class={BUTTON_PRIMARY}>
                {busy()
                  ? "Checking with Payaza…"
                  : editing()
                    ? "Check name and update"
                    : "Check name and add"}
              </button>
            </div>
          </form>
        </Show>
      </Suspense>
    </main>
  );
}
