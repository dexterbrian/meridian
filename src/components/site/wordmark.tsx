import { A } from "@solidjs/router";

export function Wordmark() {
  return (
    <A href="/" class="flex items-center gap-2.5">
      <span class="relative flex h-8 w-8 items-center justify-center rounded-lg bg-flow">
        <span class="h-4 w-4 rounded-full border-2 border-primary-foreground/80" />
      </span>
      <span class="font-display text-lg font-semibold tracking-tight">Meridian</span>
    </A>
  );
}

/** Slim header used on demo and pay pages. */
export function DemoHeader(props: { width?: "3xl" | "5xl" }) {
  return (
    <header class="border-b border-border/70 px-5 py-4">
      <div
        class={`mx-auto flex items-center justify-between ${props.width === "3xl" ? "max-w-3xl" : "max-w-5xl"}`}
      >
        <Wordmark />
        <span class="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
          Demo
        </span>
      </div>
    </header>
  );
}
