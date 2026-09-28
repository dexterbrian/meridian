import { Meta, Title } from "@solidjs/meta";
import {
  A,
  createAsync,
  query,
  revalidate,
  useParams,
  useSearchParams,
  type RouteDefinition,
} from "@solidjs/router";
import CheckCircle2 from "lucide-solid/icons/check-circle-2";
import ShieldCheck from "lucide-solid/icons/shield-check";
import { Match, Show, Suspense, Switch, createEffect, createSignal, onCleanup } from "solid-js";

import { FeeBreakdown, FeeSummary, WhyFeesCard } from "~/components/fee-breakdown";
import {
  CheckoutLauncher,
  MethodChoice,
  MomoWait,
  PayerFields,
  VirtualAccountBox,
} from "~/components/pay-flow";
import { INPUT_CLASS, PayMethodPicker, payButtonLabel } from "~/components/pay-methods";
import { DemoBanner } from "~/components/site/banner";
import { SiteFooter } from "~/components/site/footer";
import { DemoHeader } from "~/components/site/wordmark";
import { Timeline } from "~/components/status";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Notice } from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { formatMoney, methodsFor, quoteCollection, type PayMethod } from "~/lib/fees";
import { networksFor } from "~/lib/payaza-codes";
import { isTerminal } from "~/lib/status";
import type { AttemptView } from "~/server/money/collect";
import {
  getPublicRequest,
  pollAttempt,
  sandboxApprove,
  startPayment,
  submitOtp,
} from "~/server/pay-actions";
import { getDemoPaymentLink, payDemoPaymentLink } from "~/server/public-actions";

// The hosted pay page. A real payment request (payment_requests) is paid through
// Payaza. A reference that only exists in demo_transactions falls back to the
// simulated demo, so the landing page demos keep working.

const loadRequest = query((reference: string) => getPublicRequest(reference), "public-request");
const loadDemo = query((reference: string) => getDemoPaymentLink(reference), "demo-payment-link");
const loadAttempt = query((id: string) => pollAttempt(id), "attempt");

export const route = {
  preload: ({ params, location }) => {
    void loadRequest(params["reference"] ?? "");
    const attempt = new URLSearchParams(location.search).get("attempt");
    if (attempt) void loadAttempt(attempt);
  },
} satisfies RouteDefinition;

export default function PayRequest() {
  const params = useParams<{ reference: string }>();
  const request = createAsync(() => loadRequest(params.reference));
  return (
    <Suspense
      fallback={
        <PageShell>
          <p class="text-sm text-muted-foreground">Loading request…</p>
        </PageShell>
      }
    >
      <Show when={request() !== undefined}>
        <Show when={request()} fallback={<DemoPay />}>
          {(r) => <RealPay request={r()} />}
        </Show>
      </Show>
    </Suspense>
  );
}

function PageShell(props: {
  children: import("solid-js").JSX.Element;
  sandbox?: boolean;
  demo?: boolean;
}) {
  return (
    <div class="min-h-screen">
      <Show when={props.demo}>
        <DemoBanner>Demo. This is what the payer sees. No money moves.</DemoBanner>
      </Show>
      <Show when={props.sandbox}>
        <DemoBanner>
          Sandbox. This payment runs through Payaza's test environment. No real money moves.
        </DemoBanner>
      </Show>
      <DemoHeader />
      <main class="mx-auto max-w-5xl px-5 py-12">{props.children}</main>
      <SiteFooter />
    </div>
  );
}

/* ------------------------------- real payment ----------------------------- */

type PublicRequest = NonNullable<Awaited<ReturnType<typeof getPublicRequest>>>;

function RealPay(props: { request: PublicRequest }) {
  const params = useParams<{ reference: string }>();
  const [search, setSearch] = useSearchParams<{ attempt?: string }>();
  const storageKey = () => `meridian:attempt:${params.reference}`;

  const [method, setMethod] = createSignal<PayMethod | null>(null);
  const [network, setNetwork] = createSignal("");
  const [country, setCountry] = createSignal(
    props.request.currency === "USD"
      ? "US"
      : (networksFor(props.request.currency)[0]?.country ?? "KE"),
  );
  const [busy, setBusy] = createSignal(false);
  const [showBreakdown, setShowBreakdown] = createSignal(false);
  const [attemptId, setAttemptId] = createSignal<string | null>(
    search.attempt ??
      (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(storageKey()) : null),
  );
  const attempt = createAsync(() =>
    attemptId() ? loadAttempt(attemptId()!) : Promise.resolve(null),
  );
  const [sandbox, setSandbox] = createSignal(false);

  const amount = () => props.request.amount ?? 0;
  const quote = () => quoteCollection(amount(), method(), props.request.currency);
  const available = () => methodsFor(props.request.currency);
  const total = () => formatMoney(quote().payerPays, props.request.currency);

  createEffect(() => {
    if (method() === "momo" && !network())
      setNetwork(networksFor(props.request.currency)[0]?.code ?? "");
  });
  createEffect(() => {
    const a = attempt();
    if (a) setSandbox(a.sandbox);
  });

  // Poll while the attempt is moving. Webhooks update the server; this pulls the result.
  createEffect(() => {
    const id = attemptId();
    if (!id) return;
    const timer = setInterval(() => {
      const a = attempt();
      if (a && isTerminal(a.status)) return;
      void revalidate(loadAttempt.keyFor(id));
    }, 3000);
    onCleanup(() => clearInterval(timer));
  });

  function rememberAttempt(id: string | null) {
    setAttemptId(id);
    if (id) sessionStorage.setItem(storageKey(), id);
    else sessionStorage.removeItem(storageKey());
    setSearch({ attempt: id ?? undefined }, { replace: true });
  }

  async function pay(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault();
    const m = method();
    if (!m) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await startPayment({
        reference: params.reference,
        method: m,
        payer_name: String(fd.get("payer_name") ?? ""),
        payer_email: String(fd.get("payer_email") ?? ""),
        payer_phone: String(fd.get("payer_phone") ?? ""),
        payer_country: country(),
        network: m === "momo" ? network() : "",
      });
      if (!r.ok) {
        toast.error(r.error);
        if (r.code === "closed") await revalidate(loadRequest.keyFor(params.reference));
        return;
      }
      rememberAttempt(r.transactionId);
    } catch {
      toast.error("We could not start this payment. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onOtp(otp: string) {
    const id = attemptId();
    if (!id) return;
    const r = await submitOtp({ transaction_id: id, otp });
    if (!r.ok) return toast.error(r.error);
    toast.success("Code sent. Confirm on your phone.");
    await revalidate(loadAttempt.keyFor(id));
  }

  async function approveInSandbox() {
    const id = attemptId();
    if (!id) return;
    setBusy(true);
    try {
      const r = await sandboxApprove(id);
      if (!r.ok) return toast.error(r.error);
      toast.success("Sandbox: payer approved. Waiting for Payaza's confirmation…");
      await revalidate(loadAttempt.keyFor(id));
    } finally {
      setBusy(false);
    }
  }

  function tryAgain() {
    rememberAttempt(null);
    setMethod(null);
    void revalidate(loadRequest.keyFor(params.reference));
  }

  const title = () => `Pay ${props.request.businessName} — Meridian`;

  return (
    <PageShell sandbox={sandbox()}>
      <Title>{title()}</Title>
      <Meta
        name="description"
        content={`Pay ${props.request.businessName} through Meridian. Every fee shown before you pay.`}
      />
      <Meta name="robots" content="noindex" />

      <Switch>
        <Match when={attemptId() && attempt()}>
          {(_) => (
            <AttemptPanel
              attempt={attempt()!}
              request={props.request}
              onOtp={onOtp}
              onApprove={approveInSandbox}
              onAgain={tryAgain}
              busy={busy()}
            />
          )}
        </Match>
        <Match when={props.request.status !== "active"}>
          <div class="panel mx-auto max-w-lg p-8 text-center">
            <Show
              when={props.request.status === "paid"}
              fallback={
                <h1 class="font-display text-2xl font-bold">This link is no longer open</h1>
              }
            >
              <CheckCircle2 class="mx-auto h-12 w-12 text-success" />
              <h1 class="mt-4 font-display text-2xl font-bold">Already paid</h1>
            </Show>
            <p class="mt-2 text-sm text-muted-foreground">
              {props.request.status === "paid"
                ? `${formatMoney(amount(), props.request.currency)} was paid to ${props.request.businessName}.`
                : props.request.status === "expired"
                  ? "This payment link has expired. Ask the business for a new one."
                  : "The business has closed this payment link."}
            </p>
            <p class="mt-4 font-mono text-sm text-primary">{props.request.reference}</p>
          </div>
        </Match>
        <Match when={true}>
          <div class="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <form onSubmit={pay} class="panel space-y-6 p-6">
              <div>
                <p class="text-xs uppercase tracking-widest text-muted-foreground">
                  Payment request from
                </p>
                <p class="mt-1 text-lg font-semibold">{props.request.businessName}</p>
                <h1 class="mt-3 font-display text-3xl font-bold">
                  {formatMoney(amount(), props.request.currency)}
                </h1>
                <p class="mt-2 text-sm text-muted-foreground">
                  <Show when={props.request.invoiceNumber}>
                    Invoice {props.request.invoiceNumber} ·{" "}
                  </Show>
                  <span class="font-mono text-primary">{props.request.reference}</span>
                </p>
                <Show when={props.request.memo}>
                  <p class="mt-1 text-sm">{props.request.memo}</p>
                </Show>
              </div>

              <Show when={!props.request.hasPayoutAccount}>
                <Notice tone="warning">
                  {props.request.businessName} has not finished setting up. Please try again later.
                </Notice>
              </Show>

              <FeeSummary
                quote={quote()}
                currencyCode={props.request.currency}
                note={method() ? undefined : "Pick a payment method to see the fees."}
                open={showBreakdown()}
                onToggle={() => setShowBreakdown((o) => !o)}
                breakdownId="fee-breakdown"
              />

              <MethodChoice
                currency={props.request.currency}
                available={available()}
                method={method()}
                onChange={setMethod}
              />

              <Show when={method()}>
                {(m) => (
                  <PayerFields
                    currency={props.request.currency}
                    method={m()}
                    network={network()}
                    onNetwork={setNetwork}
                    country={country()}
                    onCountry={setCountry}
                  />
                )}
              </Show>

              <button
                type="submit"
                disabled={busy() || !method() || !props.request.hasPayoutAccount}
                class={`${BUTTON_PRIMARY} w-full py-3`}
              >
                {busy() ? "Starting…" : method() ? `Pay ${total()}` : "Choose a payment method"}
              </button>
              <p class="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck class="h-3.5 w-3.5" /> Processed by Payaza.{" "}
                {props.request.businessName} receives the full{" "}
                {formatMoney(amount(), props.request.currency)}.
              </p>
            </form>

            <div class="space-y-4">
              <Show when={showBreakdown()}>
                <FeeBreakdown
                  id="fee-breakdown"
                  quote={quote()}
                  currencyCode={props.request.currency}
                  netLabel={`${props.request.businessName} receives`}
                  note={method() ? undefined : "Pick a payment method to see the fees."}
                />
              </Show>
              <WhyFeesCard />
            </div>
          </div>
        </Match>
      </Switch>
    </PageShell>
  );
}

function AttemptPanel(props: {
  attempt: AttemptView;
  request: PublicRequest;
  onOtp: (otp: string) => Promise<void>;
  onApprove: () => Promise<void>;
  onAgain: () => void;
  busy: boolean;
}) {
  const a = () => props.attempt;
  const total = () => formatMoney(a().totalCharged, a().currency);
  const amount = () => formatMoney(props.request.amount ?? 0, props.request.currency);
  return (
    <div class="mx-auto max-w-2xl space-y-6">
      <div class="panel p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-widest text-muted-foreground">
              Paying {props.request.businessName}
            </p>
            <h1 class="mt-1 font-display text-3xl font-bold">{amount()}</h1>
            <p class="mt-2 text-sm text-muted-foreground">
              <Show when={props.request.invoiceNumber}>
                Invoice {props.request.invoiceNumber} ·{" "}
              </Show>
              <span class="font-mono text-primary">{a().reference}</span>
            </p>
          </div>
        </div>
        <div class="mt-6">
          <Timeline status={a().status} payoutSimulated={a().payoutSimulated} />
        </div>
      </div>

      <Switch>
        <Match when={a().status === "awaiting_payin" && a().payin?.kind === "momo"}>
          <MomoWait
            payin={a().payin as Extract<AttemptView["payin"], { kind: "momo" }>}
            total={total()}
            onOtp={props.onOtp}
          />
        </Match>
        <Match when={a().status === "awaiting_payin" && a().payin?.kind === "virtual_account"}>
          <VirtualAccountBox
            payin={a().payin as Extract<AttemptView["payin"], { kind: "virtual_account" }>}
            total={total()}
          />
        </Match>
        <Match when={a().status === "awaiting_payin" && a().payin?.kind === "checkout"}>
          <CheckoutLauncher
            payin={a().payin as Extract<AttemptView["payin"], { kind: "checkout" }>}
            onHint={() => void revalidate(loadAttempt.keyFor(a().id))}
          />
        </Match>
        <Match when={a().status === "collected" || a().status === "paying_out"}>
          <Notice tone="info">
            Payment received. {props.request.businessName} is being paid the full {amount()} now.
            <Show when={a().payoutSimulated}>
              {" "}
              (Sandbox: the payout is simulated because Payaza's test merchant holds no payout
              float.)
            </Show>
          </Notice>
        </Match>
        <Match when={a().status === "held"}>
          <Notice tone="warning">
            Payment received. Before it is paid out, Meridian needs to check something. The business
            will hear from us within one business day.
          </Notice>
        </Match>
        <Match when={a().status === "settled"}>
          <div class="panel p-8 text-center">
            <CheckCircle2 class="mx-auto h-12 w-12 text-success" />
            <h2 class="mt-4 font-display text-2xl font-bold">Paid and settled</h2>
            <p class="mt-2 text-sm text-muted-foreground">
              {amount()} reached {props.request.businessName}. You paid {total()} including fees. A
              receipt is on its way to your email.
            </p>
            <A href="/" class={`${BUTTON_SECONDARY} mt-6`}>
              Back to Meridian
            </A>
          </div>
        </Match>
        <Match when={a().status === "failed" || a().status === "blocked"}>
          <div class="panel p-8 text-center">
            <h2 class="font-display text-2xl font-bold">
              {a().status === "blocked"
                ? "We could not accept this payment"
                : "This payment did not go through"}
            </h2>
            <p class="mt-2 text-sm text-muted-foreground">
              {a().failureReason ?? "No money was taken."}
            </p>
            <Show when={a().status === "failed"}>
              <button
                type="button"
                onClick={() => props.onAgain()}
                class={`${BUTTON_PRIMARY} mt-6`}
              >
                Try again
              </button>
            </Show>
          </div>
        </Match>
      </Switch>

      <Show when={a().sandbox && a().status === "awaiting_payin" && a().payin?.kind !== "checkout"}>
        <div class="rounded-xl border border-dashed border-accent/60 p-4 text-center text-sm">
          <p class="text-muted-foreground">
            Sandbox: nobody's phone will ring. Press this to play the payer approving.
          </p>
          <button
            type="button"
            onClick={() => void props.onApprove()}
            disabled={props.busy}
            class={`${BUTTON_SECONDARY} mt-3`}
          >
            {props.busy ? "Approving…" : "Simulate approval on the phone"}
          </button>
        </div>
      </Show>
      <Show when={a().sandbox && a().status === "awaiting_payin" && a().payin?.kind === "checkout"}>
        <p class="text-center text-xs text-muted-foreground">
          Sandbox: use one of Payaza's test cards in the checkout.
        </p>
      </Show>

      <Show when={a().status === "awaiting_payin"}>
        <p class="text-center text-xs text-muted-foreground">
          Wrong number or changed your mind?{" "}
          <button
            type="button"
            onClick={() => props.onAgain()}
            class="underline hover:text-foreground"
          >
            Start over
          </button>
        </p>
      </Show>
      <p class="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck class="h-3.5 w-3.5" /> Processed by Payaza. Confirmed by Meridian before
        anything moves.
      </p>
    </div>
  );
}

/* ---------------------------------- demo ---------------------------------- */
// Unchanged behaviour: the request lives in demo_transactions and nothing is charged.

function DemoPay() {
  const params = useParams<{ reference: string }>();
  const link = createAsync(() => loadDemo(params.reference));
  const [method, setMethod] = createSignal<PayMethod | null>(null);
  const [payerEmail, setPayerEmail] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [showBreakdown, setShowBreakdown] = createSignal(false);
  const quote = (amount: number) => quoteCollection(amount, method());

  async function settle(e: SubmitEvent) {
    e.preventDefault();
    const m = method();
    if (!link() || !m) return;
    setBusy(true);
    try {
      const result = await payDemoPaymentLink({
        reference: params.reference,
        method: m,
        payerEmail: payerEmail(),
      });
      if (!result.ok) return toast.error(result.error);
      await revalidate(loadDemo.keyFor(params.reference));
      toast.success("Demo payment sent.");
    } catch {
      toast.error("Payment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell demo>
      <Title>Pay a Meridian request (demo)</Title>
      <Meta
        name="description"
        content="Pay a Meridian payment request. Demo only. No money moves."
      />
      <Suspense fallback={<p class="text-sm text-muted-foreground">Loading request…</p>}>
        <Switch>
          <Match when={link() === null}>
            <div class="panel p-8 text-center">
              <h1 class="font-display text-2xl font-bold">Link not found</h1>
              <p class="mt-2 text-sm text-muted-foreground">
                No payment request matches {params.reference}.
              </p>
              <A href="/demo/request" class={`${BUTTON_PRIMARY} mt-6`}>
                Create a demo payment request
              </A>
            </div>
          </Match>
          <Match when={link()?.status === "paid" && link()}>
            {(data) => (
              <div class="panel p-8 text-center">
                <CheckCircle2 class="mx-auto h-12 w-12 text-success" />
                <h1 class="mt-4 font-display text-2xl font-bold">Paid</h1>
                <p class="mt-2 text-sm text-muted-foreground">
                  {formatMoney(data().amount, data().currency)} sent to {data().fromBusiness}.
                </p>
                <p class="mt-4 font-mono text-sm text-primary">{data().reference}</p>
                <A href="/" class={`${BUTTON_SECONDARY} mt-6`}>
                  Back to Meridian
                </A>
              </div>
            )}
          </Match>
          <Match when={link()}>
            {(data) => (
              <div class="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                <form onSubmit={settle} class="panel space-y-6 p-6">
                  <div>
                    <p class="text-xs uppercase tracking-widest text-muted-foreground">
                      Payment request
                    </p>
                    <h1 class="mt-1 font-display text-3xl font-bold">
                      {formatMoney(data().amount, data().currency)}
                    </h1>
                    <p class="mt-2 text-sm text-muted-foreground">
                      From {data().fromBusiness} to {data().toBusiness}
                    </p>
                    {data().memo && <p class="mt-1 text-sm">{data().memo}</p>}
                    <p class="mt-3 font-mono text-xs text-primary">{data().reference}</p>
                  </div>
                  <FeeSummary
                    quote={quote(data().amount)}
                    currencyCode={data().currency}
                    note={method() ? undefined : "Pick a payment method to see the fees."}
                    open={showBreakdown()}
                    onToggle={() => setShowBreakdown((o) => !o)}
                    breakdownId="fee-breakdown"
                  />
                  <input
                    type="email"
                    autocomplete="email"
                    aria-label="Your email for the receipt"
                    placeholder="Your email for the receipt"
                    value={payerEmail()}
                    onInput={(e) => setPayerEmail(e.currentTarget.value)}
                    class={INPUT_CLASS}
                  />
                  <PayMethodPicker
                    method={method()}
                    onChange={setMethod}
                    total={formatMoney(quote(data().amount).payerPays, data().currency)}
                  />
                  <button
                    type="submit"
                    disabled={busy() || !method()}
                    class={`${BUTTON_PRIMARY} w-full py-3`}
                  >
                    {busy()
                      ? "Processing…"
                      : payButtonLabel(
                          method(),
                          formatMoney(quote(data().amount).payerPays, data().currency),
                        )}
                  </button>
                  <p class="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck class="h-3.5 w-3.5" /> Simulated payment. Nothing is charged.
                  </p>
                </form>
                <div class="space-y-4">
                  <Show when={showBreakdown()}>
                    <FeeBreakdown
                      id="fee-breakdown"
                      quote={quote(data().amount)}
                      currencyCode={data().currency}
                      netLabel={`${data().fromBusiness} receives`}
                      note={method() ? undefined : "Pick a payment method to see the fees."}
                    />
                  </Show>
                  <WhyFeesCard />
                </div>
              </div>
            )}
          </Match>
        </Switch>
      </Suspense>
    </PageShell>
  );
}
