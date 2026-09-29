import { createMiddleware } from "@solidjs/start/middleware";
import { authLinkForward, guardRoute, isGuardedPath } from "~/lib/auth-rules";
import { viewerFromRequest } from "~/server/auth";

// Sign-in links that Supabase sent to the home page are forwarded to /auth/callback.
// Page guards on full page loads:
//   /app/*   signed out  -> 302 to sign-in, then back.
//   /admin/* not admin   -> 404, so the area does not reveal itself.
// Client-side navigation is guarded again by the /app and /admin layouts.
export default createMiddleware([
  async (event) => {
    const url = event.url;
    if (event.req.method !== "GET") return undefined;

    // A sign-in link Supabase sent to the home page instead of /auth/callback.
    const forward = authLinkForward(url.pathname, url.search);
    if (forward) return new Response(null, { status: 302, headers: { Location: forward } });

    if (!isGuardedPath(url.pathname)) return undefined;

    event.res.headers.set("Cache-Control", "private, no-store");
    const viewer = await viewerFromRequest(event.req, event.res.headers);
    const result = guardRoute(url.pathname, url.search, viewer);

    if (result.kind === "sign-in") {
      const location = `/auth/sign-in?next=${encodeURIComponent(result.next)}`;
      return new Response(null, { status: 302, headers: { Location: location } });
    }
    if (result.kind === "not-found") {
      return new Response("Not found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return undefined;
  },
]);
