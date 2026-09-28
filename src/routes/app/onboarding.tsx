import { Title } from "@solidjs/meta";
import { createAsync, query, revalidate, useNavigate, type RouteDefinition } from "@solidjs/router";
import { For, Show, Suspense, createSignal } from "solid-js";

import { BUTTON_PRIMARY, Field, INPUT_CLASS, SELECT_CLASS } from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { BUSINESS_COUNTRIES, COUNTRY_NAMES } from "~/lib/payaza-codes";
import { businessProfileSchema } from "~/lib/schemas";
import { getMyBusiness, saveBusinessProfile } from "~/server/business-actions";

const loadBusiness = query(() => getMyBusiness(), "my-business");

export const route = { preload: () => loadBusiness() } satisfies RouteDefinition;

export default function Onboarding() {
  const business = createAsync(() => loadBusiness());
  const navigate = useNavigate();
  const [busy, setBusy] = createSignal(false);
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  async function save(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = Object.fromEntries(
      [
        "name",
        "trading_name",
        "country",
        "registration_number",
        "tax_number",
        "address",
        "website",
        "contact_email",
        "contact_phone",
      ].map((k) => [k, String(fd.get(k) ?? "")]),
    );
    const parsed = businessProfileSchema.safeParse(input);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const r = await saveBusinessProfile(parsed.data);
      if (!r.ok) return toast.error(r.error);
      await revalidate(["my-business", "dashboard"]);
      toast.success("Business profile saved.");
      if (!business()) navigate("/app/settings/payout-accounts");
    } catch {
      toast.error("Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl px-5 py-10">
      <Title>Business profile — Meridian</Title>
      <h1 class="font-display text-3xl font-bold">Your business</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        This is the name payers see on the pay page and on receipts. Payouts can only go to an
        account in this name.
      </p>
      <Suspense fallback={<p class="mt-8 text-sm text-muted-foreground">Loading…</p>}>
        <form onSubmit={save} class="panel mt-8 space-y-5 p-6">
          <Field label="Legal name" for="name" error={errors()["name"]}>
            <input
              id="name"
              name="name"
              required
              value={business()?.name ?? ""}
              class={INPUT_CLASS}
            />
          </Field>
          <Field
            label="Trading name"
            for="trading_name"
            optional
            hint="If different from the legal name."
            error={errors()["trading_name"]}
          >
            <input
              id="trading_name"
              name="trading_name"
              value={business()?.trading_name ?? ""}
              class={INPUT_CLASS}
            />
          </Field>
          <div class="grid gap-5 sm:grid-cols-2">
            <Field
              label="Country"
              for="country"
              error={errors()["country"]}
              hint="Where the business is registered. Payaza pays out to these markets."
            >
              <select
                id="country"
                name="country"
                required
                class={SELECT_CLASS}
                value={business()?.country ?? "KE"}
              >
                <For each={BUSINESS_COUNTRIES}>
                  {(c) => (
                    <option value={c} selected={(business()?.country ?? "KE") === c}>
                      {COUNTRY_NAMES[c] ?? c}
                    </option>
                  )}
                </For>
              </select>
            </Field>
            <Field
              label="Registration number"
              for="registration_number"
              optional
              error={errors()["registration_number"]}
            >
              <input
                id="registration_number"
                name="registration_number"
                value={business()?.registration_number ?? ""}
                class={INPUT_CLASS}
              />
            </Field>
          </div>
          <div class="grid gap-5 sm:grid-cols-2">
            <Field
              label="Tax number"
              for="tax_number"
              optional
              hint="KRA PIN, TIN."
              error={errors()["tax_number"]}
            >
              <input
                id="tax_number"
                name="tax_number"
                value={business()?.tax_number ?? ""}
                class={INPUT_CLASS}
              />
            </Field>
            <Field label="Website" for="website" optional error={errors()["website"]}>
              <input
                id="website"
                name="website"
                type="url"
                placeholder="https://"
                value={business()?.website ?? ""}
                class={INPUT_CLASS}
              />
            </Field>
          </div>
          <Field label="Address" for="address" optional error={errors()["address"]}>
            <input
              id="address"
              name="address"
              value={business()?.address ?? ""}
              class={INPUT_CLASS}
            />
          </Field>
          <div class="grid gap-5 sm:grid-cols-2">
            <Field
              label="Contact email"
              for="contact_email"
              hint="Receipts and payment notices go here."
              error={errors()["contact_email"]}
            >
              <input
                id="contact_email"
                name="contact_email"
                type="email"
                value={business()?.contact_email ?? ""}
                class={INPUT_CLASS}
              />
            </Field>
            <Field
              label="Contact phone"
              for="contact_phone"
              optional
              error={errors()["contact_phone"]}
            >
              <input
                id="contact_phone"
                name="contact_phone"
                type="tel"
                value={business()?.contact_phone ?? ""}
                class={INPUT_CLASS}
              />
            </Field>
          </div>
          <div class="flex items-center justify-end gap-3 pt-2">
            <Show when={business()}>
              <span class="text-xs text-muted-foreground">
                Saved {new Date(business()!.updated_at).toLocaleString("en-GB")}
              </span>
            </Show>
            <button type="submit" disabled={busy()} class={BUTTON_PRIMARY}>
              {busy() ? "Saving…" : business() ? "Save changes" : "Continue"}
            </button>
          </div>
        </form>
      </Suspense>
    </main>
  );
}
