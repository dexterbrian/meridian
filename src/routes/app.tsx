import {
  createAsync,
  query,
  redirect,
  useLocation,
  type RouteDefinition,
  type RouteSectionProps,
} from "@solidjs/router";
import LogOut from "lucide-solid/icons/log-out";
import { Show } from "solid-js";

import { Wordmark } from "~/components/site/wordmark";
import { getViewer, signOut } from "~/server/auth-actions";

// Layout for the business area. Signed-out visitors go to sign-in. The
// middleware does the same on full page loads; this covers client navigation.
const requireViewer = query(async (path: string) => {
  const viewer = await getViewer();
  if (!viewer) throw redirect(`/auth/sign-in?next=${encodeURIComponent(path)}`);
  return viewer;
}, "app-viewer");

export const route = {
  preload: ({ location }) => requireViewer(location.pathname),
} satisfies RouteDefinition;

export default function AppLayout(props: RouteSectionProps) {
  const location = useLocation();
  const viewer = createAsync(() => requireViewer(location.pathname));

  async function onSignOut() {
    await signOut();
    window.location.assign("/");
  }

  return (
    <Show when={viewer()}>
      {(v) => (
        <div class="min-h-screen">
          <header class="border-b border-border/70 px-5 py-4">
            <div class="mx-auto flex max-w-6xl items-center justify-between">
              <Wordmark />
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
          </header>
          {props.children}
        </div>
      )}
    </Show>
  );
}
