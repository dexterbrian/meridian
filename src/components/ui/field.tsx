import type { JSX } from "solid-js";
import { Show } from "solid-js";

// Form primitives. Every input has a visible label, so screen readers and
// people both know what the field is (hackathon PRD 7, accessibility).

export const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/60 disabled:opacity-60";

export const SELECT_CLASS = `${INPUT_CLASS} appearance-none`;

export const BUTTON_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-full bg-flow px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60";

export const BUTTON_SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60";

export const BUTTON_DANGER =
  "inline-flex items-center justify-center gap-2 rounded-full border border-destructive/50 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60";

export function Field(props: {
  label: string;
  for: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: JSX.Element;
}) {
  return (
    <div>
      <label for={props.for} class="mb-1 block text-xs font-semibold text-muted-foreground">
        {props.label}
        <Show when={props.optional}>
          <span class="ml-1 font-normal opacity-70">(optional)</span>
        </Show>
      </label>
      {props.children}
      <Show when={props.hint && !props.error}>
        <p class="mt-1 text-xs text-muted-foreground/80">{props.hint}</p>
      </Show>
      <Show when={props.error}>
        <p class="mt-1 text-xs text-destructive">{props.error}</p>
      </Show>
    </div>
  );
}

export function Notice(props: {
  tone?: "info" | "warning" | "danger" | "success";
  children: JSX.Element;
}) {
  const tone = () => props.tone ?? "info";
  const cls = {
    info: "border-primary/40 bg-primary/10 text-foreground",
    warning: "border-warning/50 bg-warning/10 text-foreground",
    danger: "border-destructive/50 bg-destructive/10 text-foreground",
    success: "border-success/50 bg-success/10 text-foreground",
  };
  return <div class={`rounded-xl border px-4 py-3 text-sm ${cls[tone()]}`}>{props.children}</div>;
}
