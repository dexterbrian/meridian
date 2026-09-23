import Menu from "lucide-solid/icons/menu";
import X from "lucide-solid/icons/x";
import { For, Show, createSignal } from "solid-js";
import { Wordmark } from "./wordmark";

const NAV = [
  { label: "Why Meridian", href: "/#problem" },
  { label: "How it works", href: "/#how" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Demos", href: "/#demos" },
  { label: "FAQ", href: "/#faq" },
];

export function SiteHeader() {
  const [open, setOpen] = createSignal(false);
  return (
    <header class="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Wordmark />
        <nav class="hidden items-center gap-7 md:flex">
          <For each={NAV}>
            {(item) => (
              <a
                href={item.href}
                class="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            )}
          </For>
        </nav>
        <div class="flex items-center gap-3">
          <a
            href="/#waitlist"
            class="hidden rounded-full bg-flow px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 sm:inline-flex"
          >
            Join the waitlist
          </a>
          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
            class="rounded-lg border border-border p-2 md:hidden"
          >
            <Show when={open()} fallback={<Menu class="h-4 w-4" />}>
              <X class="h-4 w-4" />
            </Show>
          </button>
        </div>
      </div>
      <Show when={open()}>
        <nav class="flex flex-col gap-1 border-t border-border px-5 py-3 md:hidden">
          <For each={[...NAV, { label: "Join the waitlist", href: "/#waitlist" }]}>
            {(item) => (
              <a
                href={item.href}
                onClick={() => setOpen(false)}
                class="rounded-lg px-2 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {item.label}
              </a>
            )}
          </For>
        </nav>
      </Show>
    </header>
  );
}
