import type { APIEvent } from "@solidjs/start/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "~/lib/auth-rules";
import { supabaseForRequest } from "~/server/auth";

// Where the link in the sign-in email lands. Handles both link styles Supabase
// sends: ?code= (PKCE) and ?token_hash=&type=. Sets the session cookies, then
// sends the user on to where they were going.
export async function GET(event: APIEvent) {
  const url = new URL(event.request.url);
  const next = safeNext(url.searchParams.get("next"));
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  const supabase = supabaseForRequest(event.request, headers);

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  headers.set("Location", ok ? next : `/auth/sign-in?error=link&next=${encodeURIComponent(next)}`);
  return new Response(null, { status: 302, headers });
}
