import { Title } from "@solidjs/meta";
import {
  A,
  createAsync,
  query,
  revalidate,
  useParams,
  type RouteDefinition,
} from "@solidjs/router";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Copy from "lucide-solid/icons/copy";
import { For, Show, Suspense, createSignal, onCleanup, onMount } from "solid-js";

import Pencil from "lucide-solid/icons/pencil";
import { RequestBadge, Timeline, TransactionBadge } from "~/components/status";
import {
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  Field,
  INPUT_CLASS,
  Notice,
  SELECT_CLASS,
} from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { CURRENCIES, METHOD_LABEL, formatMoney, type Currency, type PayMethod } from "~/lib/fees";
import { COUNTRY_NAMES } from "~/lib/payaza-codes";
import { requestEditRules } from "~/lib/request-edit";
import { paymentRequestUpdateSchema } from "~/lib/schemas";
import { isTerminal, type TransactionStatus } from "~/lib/status";
import {
  disablePaymentRequest,
  getPaymentRequest,
  updatePaymentRequest,
  type PaymentRequest,
} from "~/server/business-actions";

const loadRequest = query((reference: string) => getPaymentRequest(reference), "request-detail");

export const route = {
  preload: ({ params }) => loadRequest(params["reference"] ?? ""),
} satisfies RouteDefinition;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium" });

/** Edit form for an active request. Amount, currency and usage lock once a payer starts. */
function EditRequestForm(props: { request: PaymentRequest; onDone: () => Promise<void> }) {
  const rules = () => requestEditRules(props.request);
  const [busy, setBusy] = createSignal(false);
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  async function save(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const locked = !rules().canEditAmount;
    const input = {
      reference: props.request.reference,
      // Locked fields go back unchanged; the server refuses a change anyway.
      amount: locked ? Number(props.request.amount) : Number(fd.get("amount")),
      currency: (locked ? props.request.currency : String(fd.get("currency"))) as Currency,
      usage: (locked ? props.request.usage : String(fd.get("usage"))) as "single" | "multi",
      invoice_number: String(fd.get("invoice_number") ?? ""),
      memo: String(fd.get("memo") ?? ""),
      payer_email: String(fd.get("payer_email") ?? ""),
      expires_in_days: Number(fd.get("expires_in_days") ?? -1),
    };
    const parsed = paymentRequestUpdateSchema.safeParse(input);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const r = await updatePaymentRequest(parsed.data);
      if (!r.ok) return toast.error(r.error);
      toast.success("Payment request updated.");
      await props.onDone();
    } catch {
      toast.error("Could not save your changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} class="panel mt-6 space-y-5 p-6">
      <h2 class="font-semibold">Edit payment request</h2>
      <Show when={rules().reason}>
        <Notice tone="info">{rules().reason}</Notice>
      </Show>
      <div class="grid gap-5 sm:grid-cols-[1fr_140px]">
        <Field label="Amount you receive" for="edit-amount" error={errors()["amount"]}>
          <input
            id="edit-amount"
            name="amount"
            type="number"
            inputmode="decimal"
            min="0.01"
            step="0.01"
            required
            value={Number(props.request.amount)}
            disabled={!rules().canEditAmount}
            class={INPUT_CLASS}
          />
        </Field>
        <Field label="Currency" for="edit-currency">
          <select
            id="edit-currency"
            name="currency"
            value={props.request.currency}
            disabled={!rules().canEditAmount}
            class={SELECT_CLASS}
          >
            <For each={CURRENCIES}>{(c) => <option value={c.code}>{c.code}</option>}</For>
          </select>
        </Field>
      </div>
      <Field
        label="Your invoice number"
        for="edit-invoice_number"
        optional
        error={errors()["invoice_number"]}
      >
        <input
          id="edit-invoice_number"
          name="invoice_number"
          value={props.request.invoice_number ?? ""}
          class={INPUT_CLASS}
        />
      </Field>
      <Field label="Note to the payer" for="edit-memo" optional error={errors()["memo"]}>
        <input id="edit-memo" name="memo" value={props.request.memo ?? ""} class={INPUT_CLASS} />
      </Field>
      <div class="grid gap-5 sm:grid-cols-2">
        <Field
          label="Payer's email"
          for="edit-payer_email"
          optional
          hint="Changing it doesn't resend the link."
          error={errors()["payer_email"]}
        >
          <input
            id="edit-payer_email"
            name="payer_email"
            type="email"
            value={props.request.payer_email ?? ""}
            class={INPUT_CLASS}
          />
        </Field>
        <Field label="Link expires" for="edit-expires_in_days">
          <select id="edit-expires_in_days" name="expires_in_days" class={SELECT_CLASS}>
            <option value="-1">
              {props.request.expires_at
                ? `Keep (${when(props.request.expires_at)})`
                : "Keep (never)"}
            </option>
            <option value="0">Never</option>
            <option value="7">In 7 days</option>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
          </select>
        </Field>
      </div>
      <Field label="How many times can it be paid?" for="edit-usage">
        <select
          id="edit-usage"
          name="usage"
          value={props.request.usage}
          disabled={!rules().canEditAmount}
          class={SELECT_CLASS}
        >
          <option value="single">Once (an invoice)</option>
          <option value="multi">Many times (a standing price, e.g. a course or event)</option>
        </select>
      </Field>
      <div class="flex justify-end pt-2">
        <button type="submit" disabled={busy()} class={BUTTON_PRIMARY}>
          {busy() ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

export default function RequestDetail() {
  const params = useParams<{ reference: string }>();
  const data = createAsync(() => loadRequest(params.reference));
  const [busy, setBusy] = createSignal(false);
  const [editing, setEditing] = createSignal(false);

  // Refresh while any attempt is still moving, so the timeline animates as webhooks land.
  onMount(() => {
    const timer = setInterval(() => {
      const d = data();
      if (d?.attempts.some((a) => !isTerminal(a.status as TransactionStatus))) {
        void revalidate(loadRequest.keyFor(params.reference));
      }
    }, 4000);
    onCleanup(() => clearInterval(timer));
  });

  async function disable() {
    if (!confirm("Disable this link? Payers will no longer be able to pay it.")) return;
    setBusy(true);
    try {
      const r = await disablePaymentRequest(params.reference);
      if (!r.ok) return toast.error(r.error);
      await revalidate([loadRequest.keyFor(params.reference), "dashboard"]);
      toast.success("Link disabled.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-4xl px-5 py-10">
      <Title>{`${params.reference} — Meridian`}</Title>
      <A
        href="/app"
        class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft class="h-4 w-4" /> All payments
      </A>
      <Suspense fallback={<p class="mt-8 text-sm text-muted-foreground">Loading…</p>}>
        <Show
          when={data()}
          fallback={<p class="mt-8 text-sm text-muted-foreground">Request not found.</p>}
        >
          {(d) => {
            const r = () => d().request;
            const cur = () => r().currency as Currency;
            return (
              <>
                <div class="mt-6 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p class="text-xs uppercase tracking-widest text-muted-foreground">
                      Payment request
                    </p>
                    <h1 class="mt-1 font-display text-3xl font-bold">
                      {formatMoney(Number(r().amount), cur())}
                    </h1>
                    <p class="mt-2 text-sm text-muted-foreground">
                      <Show when={r().invoice_number}>Invoice {r().invoice_number} · </Show>
                      <span class="font-mono text-primary">{r().reference}</span>
                      <Show when={r().memo}> · {r().memo}</Show>
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                      Created {when(r().created_at)} ·{" "}
                      {r().usage === "multi"
                        ? `Multi-use, paid ${r().paid_count} times`
                        : "Single use"}
                      <Show when={r().expires_at}> · Expires {when(r().expires_at!)}</Show>
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <RequestBadge status={r().status} />
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(d().url)
                          .then(() => toast.success("Link copied."))
                      }
                      class={BUTTON_SECONDARY}
                    >
                      <Copy class="h-4 w-4" /> Copy link
                    </button>
                    <Show when={r().status === "active"}>
                      <button
                        type="button"
                        onClick={() => setEditing((v) => !v)}
                        class={BUTTON_SECONDARY}
                        aria-expanded={editing()}
                      >
                        <Pencil class="h-4 w-4" /> {editing() ? "Close" : "Edit"}
                      </button>
                      <button
                        type="button"
                        onClick={disable}
                        disabled={busy()}
                        class={BUTTON_DANGER}
                      >
                        Disable
                      </button>
                    </Show>
                  </div>
                </div>

                <Show when={editing() && r().status === "active"}>
                  <EditRequestForm
                    request={r()}
                    onDone={() => {
                      setEditing(false);
                      return revalidate([loadRequest.keyFor(params.reference), "dashboard"]);
                    }}
                  />
                </Show>

                <h2 class="mt-10 font-semibold">Payments against this request</h2>
                <div class="mt-3 space-y-4">
                  <For
                    each={d().attempts}
                    fallback={
                      <p class="panel p-6 text-sm text-muted-foreground">
                        Nobody has paid yet. Share the link.
                      </p>
                    }
                  >
                    {(a) => (
                      <article class="panel p-5">
                        <div class="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p class="font-mono text-sm text-primary">{a.reference}</p>
                            <p class="mt-1 text-sm">
                              {a.payer_name ?? "Payer"}
                              <Show when={a.payer_email}> · {a.payer_email}</Show>
                              <Show when={a.payer_country}>
                                {" "}
                                · {COUNTRY_NAMES[a.payer_country!] ?? a.payer_country}
                              </Show>
                            </p>
                            <p class="text-xs text-muted-foreground">
                              {METHOD_LABEL[a.pay_method as PayMethod]} · payer charged{" "}
                              {formatMoney(Number(a.total_charged), cur())} · started{" "}
                              {when(a.created_at)}
                            </p>
                          </div>
                          <TransactionBadge status={a.status} />
                        </div>
                        <div class="mt-5">
                          <Timeline
                            status={a.status}
                            payoutSimulated={
                              (a.quote as Record<string, unknown> | null)?.["payoutSimulated"] ===
                              true
                            }
                          />
                        </div>
                        <Show when={a.failure_reason}>
                          <p class="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
                            {a.failure_reason}
                          </p>
                        </Show>
                        <Show when={a.flags.length}>
                          <ul class="mt-4 space-y-1 text-xs">
                            <For each={a.flags}>
                              {(f) => (
                                <li class="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">
                                  <span class="font-semibold">{f.rule}</span> ·{" "}
                                  {String((f.evidence as Record<string, unknown>)["message"] ?? "")}{" "}
                                  · {f.status}
                                </li>
                              )}
                            </For>
                          </ul>
                        </Show>
                        <details class="mt-4 text-xs text-muted-foreground">
                          <summary class="cursor-pointer">History ({a.events.length})</summary>
                          <ol class="mt-2 space-y-1 border-l border-border pl-3">
                            <For each={a.events}>
                              {(e) => (
                                <li>
                                  <span class="font-mono">{when(e.created_at)}</span> · {e.source}
                                  <Show when={e.to_status}> · → {e.to_status}</Show>
                                </li>
                              )}
                            </For>
                          </ol>
                        </details>
                        <Show when={a.payout_reference}>
                          <p class="mt-3 text-xs text-muted-foreground">
                            Payout reference <span class="font-mono">{a.payout_reference}</span>
                            <Show when={a.settled_at}> · settled {when(a.settled_at!)}</Show>
                          </p>
                        </Show>
                      </article>
                    )}
                  </For>
                </div>
              </>
            );
          }}
        </Show>
      </Suspense>
    </main>
  );
}
