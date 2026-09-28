import { Title } from "@solidjs/meta";
import { A, createAsync, query, useParams, type RouteDefinition } from "@solidjs/router";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import { For, Show, Suspense } from "solid-js";

import { Timeline, TransactionBadge } from "~/components/status";
import { getAdminTransaction } from "~/server/admin-actions";

// One transaction with everything we know: fields, events, flags and every Payaza call.
const load = query((id: string) => getAdminTransaction(id), "admin-transaction");

export const route = {
  preload: ({ params }) => load(params["id"] ?? ""),
} satisfies RouteDefinition;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" });

function Pre(props: { value: unknown }) {
  return (
    <pre class="mt-1 max-h-64 overflow-auto rounded-lg bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
      {JSON.stringify(props.value, null, 2)}
    </pre>
  );
}

export default function AdminTransaction() {
  const params = useParams<{ id: string }>();
  const data = createAsync(() => load(params.id));
  return (
    <main class="mx-auto max-w-4xl px-5 py-10">
      <Title>Transaction — Meridian admin</Title>
      <A
        href="/admin"
        class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft class="h-4 w-4" /> Admin
      </A>
      <Suspense fallback={<p class="mt-8 text-sm text-muted-foreground">Loading…</p>}>
        <Show when={data()} fallback={<p class="mt-8 text-sm">Not found.</p>}>
          {(d) => (
            <>
              <div class="mt-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="font-mono text-primary">{d().tx.reference}</p>
                  <h1 class="mt-1 font-display text-2xl font-bold">
                    {d().tx.send_currency} {Number(d().tx.send_amount).toLocaleString()} ·{" "}
                    {d().tx.businesses?.name}
                  </h1>
                  <p class="mt-1 text-xs text-muted-foreground">
                    Payer charged {d().tx.send_currency}{" "}
                    {Number(d().tx.total_charged).toLocaleString()} · partner fee{" "}
                    {Number(d().tx.partner_fee_in)} (reported {d().tx.partner_fee_reported ?? "—"})
                    · Meridian {Number(d().tx.meridian_fee)}
                  </p>
                </div>
                <TransactionBadge status={d().tx.status} />
              </div>
              <div class="panel mt-6 p-5">
                <Timeline status={d().tx.status} />
              </div>

              <section class="mt-8">
                <h2 class="font-semibold">Events ({d().events.length})</h2>
                <div class="mt-2 space-y-2">
                  <For each={d().events}>
                    {(e) => (
                      <details class="panel p-3 text-sm">
                        <summary class="cursor-pointer">
                          <span class="font-mono text-xs text-muted-foreground">
                            {when(e.created_at)}
                          </span>{" "}
                          · {e.source}
                          <Show when={e.to_status}>
                            {" "}
                            · {e.from_status ?? "—"} → {e.to_status}
                          </Show>
                          <span class="ml-2 font-mono text-[11px] text-muted-foreground">
                            {e.idempotency_key}
                          </span>
                        </summary>
                        <Pre value={e.payload} />
                      </details>
                    )}
                  </For>
                </div>
              </section>

              <section class="mt-8">
                <h2 class="font-semibold">Flags ({d().flags.length})</h2>
                <div class="mt-2 space-y-2">
                  <For
                    each={d().flags}
                    fallback={<p class="text-sm text-muted-foreground">None.</p>}
                  >
                    {(f) => (
                      <div class="panel p-3 text-sm">
                        <span class="font-semibold">{f.rule}</span> · {f.severity} ·{" "}
                        {f.action_taken} · {f.status}
                        <Pre value={f.evidence} />
                      </div>
                    )}
                  </For>
                </div>
              </section>

              <section class="mt-8">
                <h2 class="font-semibold">Payaza calls ({d().calls.length})</h2>
                <div class="mt-2 space-y-2">
                  <For
                    each={d().calls}
                    fallback={<p class="text-sm text-muted-foreground">None.</p>}
                  >
                    {(c) => (
                      <details class="panel p-3 text-sm">
                        <summary class="cursor-pointer">
                          <span class="font-mono text-xs text-muted-foreground">
                            {when(c.created_at)}
                          </span>{" "}
                          · {c.endpoint} · {c.status_code ?? "—"} · {c.duration_ms} ms
                        </summary>
                        <p class="mt-2 text-xs font-semibold">Request</p>
                        <Pre value={c.request} />
                        <p class="mt-2 text-xs font-semibold">Response</p>
                        <Pre value={c.response} />
                      </details>
                    )}
                  </For>
                </div>
              </section>
            </>
          )}
        </Show>
      </Suspense>
    </main>
  );
}
