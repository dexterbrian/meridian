import { createAsync, query, type RouteSectionProps } from "@solidjs/router";
import { Show } from "solid-js";

import { NotFound } from "~/components/not-found";
import { Wordmark } from "~/components/site/wordmark";
import { getAdminViewer } from "~/server/auth-actions";

// Layout for the admin area. Anyone who is not an admin sees a 404, so the
// area does not reveal that it exists. The middleware does the same on full loads.
const loadAdmin = query(() => getAdminViewer(), "admin-viewer");

export const route = { preload: () => loadAdmin() };

export default function AdminLayout(props: RouteSectionProps) {
  const admin = createAsync(() => loadAdmin());
  return (
    <Show when={admin() !== undefined}>
      <Show when={admin()} fallback={<NotFound />}>
        <div class="min-h-screen">
          <header class="border-b border-border/70 px-5 py-4">
            <div class="mx-auto flex max-w-6xl items-center justify-between">
              <Wordmark />
              <span class="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                Admin
              </span>
            </div>
          </header>
          {props.children}
        </div>
      </Show>
    </Show>
  );
}
