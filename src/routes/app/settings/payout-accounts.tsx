import { Title } from "@solidjs/meta";
import { A, createAsync, query, revalidate, type RouteDefinition } from "@solidjs/router";
import ShieldCheck from "lucide-solid/icons/shield-check";
import { For, Show, Suspense, createMemo, createSignal } from "solid-js";

import { BUTTON_PRIMARY, Field, INPUT_CLASS, Notice, SELECT_CLASS } from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { PAYOUT_CURRENCIES, currency as currencyInfo, type Currency } from "~/lib/fees";
import { COUNTRY_NAMES, networksFor, payoutMethodsFor } from "~/lib/payaza-codes";
import { payoutAccountSchema } from "~/lib/schemas";
import {
  getMyBusiness,
  listPayoutAccounts,
  savePayoutAccount,
  type NameCheck,
} from "~/server/business-actions";

const loadAccounts = query(() => listPayoutAccounts(), "payout-accounts");
const loadBusiness = query(() => getMyBusiness(), "my-business");

export const route = {
  preload: () => {
    void loadAccounts();
    void loadBusiness();
  },
} satisfies RouteDefinition;

export default function PayoutAccounts() {
  const accounts = createAsync(() => loadAccounts());
  const business = createAsync(() => loadBusiness());
  const [busy, setBusy] = createSignal(false);
  const [check, setCheck] = createSignal<NameCheck | null>(null);
  const [cur, setCur] = createSignal<Currency>("KES");
  const [method, setMethod] = createSignal<"momo" | "bank">("momo");
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const methods = createMemo(() => payoutMethodsFor(cur()));
  const networks = createMemo(() => networksFor(cur()));
  const countries = createMemo(() => currencyInfo(cur()).countries);
  const effectiveMethod = createMemo(() =>
    methods().includes(method()) ? method() : (methods()[0] ?? "momo"),
  );

  async function save(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
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
      toast.success(`${cur()} payout account saved.`);
      e.currentTarget.reset();
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
        Where Meridian pays you. One account per currency. The name on the account is checked with
        Payaza and must match your business.
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
                const d = a.details as Record<string, string>;
                return (
                  <div class="panel flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p class="font-semibold">
                        {a.currency} · {d["bank_name"] ?? d["bank_code"]}
                      </p>
                      <p class="font-mono text-sm text-muted-foreground">
                        {d["account_number"]} · {d["account_name"]}
                      </p>
                    </div>
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
                  </div>
                );
              }}
            </For>
          </section>

          <form onSubmit={save} class="panel mt-8 space-y-5 p-6">
            <h2 class="font-semibold">Add or replace an account</h2>
            <div class="grid gap-5 sm:grid-cols-2">
              <Field label="Currency" for="currency">
                <select
                  id="currency"
                  class={SELECT_CLASS}
                  value={cur()}
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
                <select id="country" name="country" class={SELECT_CLASS}>
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
                    <input id="bank_code" name="bank_code" class={INPUT_CLASS} />
                  </Field>
                  <Field label="Bank name" for="bank_name" error={errors()["bank_name"]}>
                    <input id="bank_name" name="bank_name" class={INPUT_CLASS} />
                  </Field>
                </div>
              }
            >
              <Field label="Network" for="bank_code" error={errors()["bank_code"]}>
                <select id="bank_code" name="bank_code" class={SELECT_CLASS}>
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
                  value={business()?.name ?? ""}
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
            <div class="flex justify-end">
              <button type="submit" disabled={busy()} class={BUTTON_PRIMARY}>
                {busy() ? "Checking with Payaza…" : "Check name and save"}
              </button>
            </div>
          </form>
        </Show>
      </Suspense>
    </main>
  );
}
