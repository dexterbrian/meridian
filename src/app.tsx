import { Meta, MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { ErrorBoundary, Suspense, createEffect } from "solid-js";
import { Toaster } from "~/components/ui/toast";
import "./styles.css";

function ErrorPage(props: { error: unknown; reset: () => void }) {
  createEffect(() => console.error(props.error));
  return (
    <div class="flex min-h-screen items-center justify-center bg-background px-4">
      <div class="max-w-md text-center">
        <h1 class="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p class="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div class="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => props.reset()}
            class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            class="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>Meridian — African money in motion</Title>
          <Meta
            name="description"
            content="Meridian moves money across African markets in minutes at a fraction of today's cost."
          />
          <ErrorBoundary fallback={(error, reset) => <ErrorPage error={error} reset={reset} />}>
            <Suspense>{props.children}</Suspense>
          </ErrorBoundary>
          <Toaster />
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
