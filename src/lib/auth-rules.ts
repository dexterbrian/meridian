// Pure rules for who may see what. No I/O, so they are unit tested.

export type Viewer = { id: string; email: string | null; isAdmin: boolean };

/** Admins are marked by hand in the Supabase dashboard: app_metadata.role = "admin". */
export function isAdminMetadata(appMetadata: unknown): boolean {
  return (
    typeof appMetadata === "object" &&
    appMetadata !== null &&
    (appMetadata as Record<string, unknown>)["role"] === "admin"
  );
}

/** Only allow same-site paths after sign-in, so a link cannot bounce people to another site. */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}

export type GuardResult =
  { kind: "allow" } | { kind: "sign-in"; next: string } | { kind: "not-found" };

function under(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * /app/* needs a signed-in user, else go to sign-in.
 * /admin/* needs an admin, else it does not exist (404), signed in or not.
 */
export function guardRoute(pathname: string, search: string, viewer: Viewer | null): GuardResult {
  if (under(pathname, "/admin")) {
    return viewer?.isAdmin ? { kind: "allow" } : { kind: "not-found" };
  }
  if (under(pathname, "/app")) {
    return viewer ? { kind: "allow" } : { kind: "sign-in", next: pathname + search };
  }
  return { kind: "allow" };
}

export function isGuardedPath(pathname: string): boolean {
  return under(pathname, "/app") || under(pathname, "/admin");
}

/**
 * Where to send a sign-in link that landed on the home page. Supabase falls back
 * to the project's Site URL when the requested redirect isn't on its allow list,
 * so the link can arrive as /?code=… (PKCE) or /?token_hash=…&type=… instead of
 * at /auth/callback. Returns the callback URL to forward to, or null if the
 * request is not a sign-in link.
 */
export function authLinkForward(pathname: string, search: string): string | null {
  if (pathname !== "/") return null;
  const params = new URLSearchParams(search);
  const isLink = params.has("code") || (params.has("token_hash") && params.has("type"));
  if (!isLink) return null;
  if (!params.has("next")) params.set("next", "/app");
  return `/auth/callback?${params.toString()}`;
}
