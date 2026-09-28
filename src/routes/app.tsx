import {
  A,
  createAsync,
  query,
  redirect,
  useLocation,
  type RouteDefinition,
  type RouteSectionProps,
} from "@solidjs/router";
import LogOut from "lucide-solid/icons/log-out";
import { For, Show } from "solid-js";

import { DemoBanner } from "~/components/site/banner";
import { Wordmark } from "~/components/site/wordmark";
import { getViewer, signOut } from "~/server/auth-actions";
import { getSandboxMode } from "~/server/public-actions";

// Layout for the business area. Signed-out visitors go to sign-in. The
// middleware does the same on full page loads; this covers client navigation.
const requireViewer = query(async (path: string) => {
  const viewer = await getViewer();
  if (!viewer) throw redirect(`/auth/sign-in?next=${encodeURIComponent(path)}`);
  return viewer;
}, "app-viewer");

const loadMode = query(() => getSandboxMode(), "sandbox-mode");

export const route = {
  preload: ({ location }) => {
    void requireViewer(location.pathname);
    void loadMode();
  },
} satisfies RouteDefinition;

const NAV = [
  { href: "/app", label: "Payments", end: true },
  { href: "/app/collect/new", label: "New request" },
  { href: "/app/settings/payout-accounts", label: "Payout accounts" },
  { href: "/app/onboarding", label: "Business profile" },
];

export default function AppLayout(props: RouteSectionProps) {
  const location = useLocation();
  const viewer = createAsync(() => requireViewer(location.pathname));
  const sandbox = createAsync(() => loadMode());

  async function onSignOut() {
    await signOut();
    window.location.assign("/");
  }

  return (
    <Show when={viewer()}>
      {(v) => (
        <div class="min-h-screen">
          <Show when={sandbox()}>
            <DemoBanner>
              Sandbox. Payments run through Payaza's test environment. No real money moves.
            </DemoBanner>
          </Show>
          <header class="border-b border-border/70 px-5 py-4">
            <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
              <div class="flex items-center gap-6">
                <Wordmark />
                <nav class="hidden items-center gap-1 md:flex" aria-label="Business area">
                  <For each={NAV}>
                    {(item) => (
                      <A
                        href={item.href}
                        end={item.end}
                        class="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                        activeClass="bg-secondary text-foreground"
                      >
                        {item.label}
                      </A>
                    )}
                  </For>
                  <Show when={v().isAdmin}>
                    <A
                      href="/admin"
                      class="rounded-full px-3 py-1.5 text-sm text-primary hover:bg-primary/10"
                    >
                      Admin
                    </A>
                  </Show>
                </nav>
              </div>
              <div class="flex items-center gap-4 text-sm">
                <span class="hidden text-muted-foreground sm:inline">{v().email}</span>
                <button
                  type="button"
                  onClick={onSignOut}
                  class="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
                >
                  <LogOut class="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
            <nav
              class="mx-auto mt-3 flex max-w-6xl gap-1 overflow-x-auto md:hidden"
              aria-label="Business area"
            >
              <For each={NAV}>
                {(item) => (
                  <A
                    href={item.href}
                    end={item.end}
                    class="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
                    activeClass="bg-secondary text-foreground"
                  >
                    {item.label}
                  </A>
                )}
              </For>
            </nav>
          </header>
          {props.children}
        </div>
      )}
    </Show>
  );
}
