import { Title } from "@solidjs/meta";
import { useNavigate, useSearchParams } from "@solidjs/router";
import Mail from "lucide-solid/icons/mail";
import { Show, createSignal } from "solid-js";

import { Wordmark } from "~/components/site/wordmark";
import { toast } from "~/components/ui/toast";
import { safeNext } from "~/lib/auth-rules";
import { requestSignInCode, verifySignInCode } from "~/server/auth-actions";

export default function SignIn() {
  const [params] = useSearchParams<{ next?: string; error?: string }>();
  const navigate = useNavigate();
  const next = () => safeNext(params.next);

  const [email, setEmail] = createSignal("");
  const [sent, setSent] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  async function sendCode(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    // Read what is in the box, not a signal, so typing before the page loads still counts.
    setEmail(String(new FormData(e.currentTarget).get("email") ?? "").trim());
    e.preventDefault();
    setBusy(true);
    try {
      const result = await requestSignInCode(email(), next());
      if (!result.ok) return toast.error(result.error);
      setSent(true);
      toast.success("Code sent. Check your inbox.");
    } catch {
      toast.error("We couldn't send a code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    const code = String(new FormData(e.currentTarget).get("code") ?? "");
    e.preventDefault();
    setBusy(true);
    try {
      const result = await verifySignInCode(email(), code);
      if (!result.ok) return toast.error(result.error);
      // Full page load so the server sees the new session cookie.
      window.location.assign(next());
    } catch {
      toast.error("Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <Title>Sign in — Meridian</Title>
      <div class="mb-8">
        <Wordmark />
      </div>
      <div class="panel w-full max-w-sm p-6">
        <Show when={params.error === "link"}>
          <p class="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            That sign-in link is invalid or has expired. Ask for a new code below.
          </p>
        </Show>
        <Show
          when={sent()}
          fallback={
            <form onSubmit={sendCode} class="space-y-4">
              <div>
                <h1 class="text-xl font-semibold">Sign in</h1>
                <p class="mt-1 text-sm text-muted-foreground">
                  We'll email you a one-time code. No password needed.
                </p>
              </div>
              <label class="block text-xs font-medium text-muted-foreground">
                Work email
                <input
                  type="email"
                  required
                  autocomplete="email"
                  name="email"
                  class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <button
                type="submit"
                disabled={busy()}
                class="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy() ? "Sending…" : "Email me a code"}
              </button>
            </form>
          }
        >
          <form onSubmit={verify} class="space-y-4">
            <div>
              <Mail class="h-6 w-6 text-primary" />
              <h1 class="mt-3 text-xl font-semibold">Check your email</h1>
              <p class="mt-1 text-sm text-muted-foreground">
                We sent a code to <span class="text-foreground">{email()}</span>. Enter it below, or
                click the link in the email.
              </p>
            </div>
            <label class="block text-xs font-medium text-muted-foreground">
              Code
              <input
                inputmode="numeric"
                autocomplete="one-time-code"
                required
                name="code"
                class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-lg tracking-[0.3em] text-foreground"
              />
            </label>
            <button
              type="submit"
              disabled={busy()}
              class="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy() ? "Checking…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                navigate(`/auth/sign-in?next=${encodeURIComponent(next())}`, { replace: true });
              }}
              class="w-full text-xs text-muted-foreground hover:text-foreground"
            >
              Use a different email
            </button>
          </form>
        </Show>
      </div>
    </div>
  );
}
