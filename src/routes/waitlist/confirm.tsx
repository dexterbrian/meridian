import { Meta, Title } from "@solidjs/meta";
import { A, createAsync, query, useSearchParams } from "@solidjs/router";
import ShieldCheck from "lucide-solid/icons/shield-check";
import { Match, Show, Switch } from "solid-js";
import { DemoBanner } from "~/components/site/banner";
import { SiteFooter } from "~/components/site/footer";
import { SiteHeader } from "~/components/site/header";
import { confirmWaitlist } from "~/server/public-actions";

const loadConfirmation = query(
  (token: string | undefined) => confirmWaitlist(token),
  "waitlist-confirm",
);

const primaryButton =
  "mt-6 inline-flex rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90";

// The "Confirm my place" link from the waitlist email.
export default function ConfirmWaitlist() {
  const [params] = useSearchParams();
  const result = createAsync(() =>
    loadConfirmation(typeof params["token"] === "string" ? params["token"] : undefined),
  );

  return (
    <>
      <Title>Confirm your place — Meridian</Title>
      <Meta name="robots" content="noindex" />
      <DemoBanner />
      <SiteHeader />
      <main class="mx-auto flex min-h-[60vh] max-w-xl items-center px-5 py-16">
        <div class="panel w-full p-8 text-center" role="status" aria-live="polite">
          <Show
            when={result()}
            fallback={<p class="text-sm text-muted-foreground">Confirming your place…</p>}
          >
            {(r) => (
              <Switch>
                <Match when={r().status === "confirmed"}>
                  <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                    <ShieldCheck class="h-6 w-6 text-success" />
                  </div>
                  <h1 class="mt-4 font-display text-2xl font-semibold">You're on the list</h1>
                  <p class="mt-2 text-sm text-muted-foreground">
                    Thanks for confirming. You'll be among the first businesses invited when early
                    access opens. We've sent the details to your inbox.
                  </p>
                  <A href="/" class={primaryButton}>
                    Back to Meridian
                  </A>
                </Match>
                <Match when={r().status === "expired"}>
                  <h1 class="font-display text-2xl font-semibold">This link has expired</h1>
                  <p class="mt-2 text-sm text-muted-foreground">
                    Join again with the same email and we'll send you a fresh link.
                  </p>
                  <A href="/#waitlist" class={primaryButton}>
                    Back to the waitlist
                  </A>
                </Match>
                <Match when={r().status === "invalid"}>
                  <h1 class="font-display text-2xl font-semibold">This link doesn't work</h1>
                  <p class="mt-2 text-sm text-muted-foreground">
                    It has already been used, or it's not valid. If you've confirmed before, you're
                    on the list.
                  </p>
                  <A href="/#waitlist" class={primaryButton}>
                    Back to the waitlist
                  </A>
                </Match>
                <Match when={r().status === "error"}>
                  <h1 class="font-display text-2xl font-semibold">Something went wrong</h1>
                  <p class="mt-2 text-sm text-muted-foreground">
                    Please try the link again in a few minutes, or reach us through the contact
                    form.
                  </p>
                  <A href="/#contact" class={primaryButton}>
                    Contact us
                  </A>
                </Match>
              </Switch>
            )}
          </Show>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
