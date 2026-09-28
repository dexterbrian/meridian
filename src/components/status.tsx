import Check from "lucide-solid/icons/check";
import X from "lucide-solid/icons/x";
import { For, Show } from "solid-js";
import {
  REQUEST_LABEL,
  REQUEST_TONE,
  TIMELINE_STEPS,
  TRANSACTION_LABEL,
  TRANSACTION_TONE,
  timelinePosition,
  type RequestStatus,
  type Tone,
  type TransactionStatus,
} from "~/lib/status";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-secondary text-muted-foreground",
  info: "border-primary/40 bg-primary/10 text-primary",
  success: "border-success/40 bg-success/15 text-success",
  warning: "border-warning/50 bg-warning/15 text-warning",
  danger: "border-destructive/40 bg-destructive/15 text-destructive",
};

export function Badge(props: { tone: Tone; children: string }) {
  return (
    <span
      class={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[props.tone]}`}
    >
      {props.children}
    </span>
  );
}

export function TransactionBadge(props: { status: string }) {
  const s = () => props.status as TransactionStatus;
  return (
    <Badge tone={TRANSACTION_TONE[s()] ?? "neutral"}>
      {TRANSACTION_LABEL[s()] ?? props.status}
    </Badge>
  );
}

export function RequestBadge(props: { status: string }) {
  const s = () => props.status as RequestStatus;
  return <Badge tone={REQUEST_TONE[s()] ?? "neutral"}>{REQUEST_LABEL[s()] ?? props.status}</Badge>;
}

const STEP_LABEL: Record<(typeof TIMELINE_STEPS)[number], string> = {
  awaiting_payin: "Waiting for payment",
  collected: "Paid",
  paying_out: "Paying out",
  settled: "Settled",
};

/** Four dots: waiting, paid, paying out, settled. Held and failed stop the line where they happened. */
export function Timeline(props: { status: string; payoutSimulated?: boolean }) {
  const pos = () => timelinePosition(props.status as TransactionStatus);
  return (
    <ol class="grid grid-cols-4 gap-2" aria-label="Payment progress">
      <For each={TIMELINE_STEPS}>
        {(step, i) => {
          const state = () => {
            const p = pos();
            if (i() < p.step) return "done";
            if (i() === p.step)
              return p.stopped ? "stopped" : props.status === "settled" ? "done" : "current";
            return "todo";
          };
          return (
            <li class="text-center">
              <div
                class="mx-auto flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold"
                classList={{
                  "border-success bg-success text-success-foreground": state() === "done",
                  "border-primary bg-primary/15 text-primary animate-pulse": state() === "current",
                  "border-destructive bg-destructive/15 text-destructive": state() === "stopped",
                  "border-border text-muted-foreground": state() === "todo",
                }}
              >
                <Show
                  when={state() === "done"}
                  fallback={
                    <Show when={state() === "stopped"} fallback={<>{i() + 1}</>}>
                      <X class="h-3.5 w-3.5" />
                    </Show>
                  }
                >
                  <Check class="h-3.5 w-3.5" />
                </Show>
              </div>
              <p class="mt-1.5 text-[11px] leading-tight text-muted-foreground">
                {step === "paying_out" && props.payoutSimulated
                  ? "Paying out (simulated)"
                  : STEP_LABEL[step]}
              </p>
            </li>
          );
        }}
      </For>
    </ol>
  );
}
