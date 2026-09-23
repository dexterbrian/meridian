import "server-only";
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestEvent } from "solid-js/web";
import type { Database } from "~/lib/database.types";
import { isAdminMetadata, type Viewer } from "~/lib/auth-rules";
import { env } from "./env";

// Session helpers for server functions, API routes and middleware.
// The session lives in Supabase's cookies. Each request gets its own client
// that reads those cookies and writes refreshed ones back to the response.

export function supabaseForRequest(
  request: Request,
  responseHeaders: Headers,
): SupabaseClient<Database> {
  return createServerClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("cookie") ?? "").map((c) => ({
          name: c.name,
          value: c.value ?? "",
        }));
      },
      setAll(cookies, headers) {
        for (const { name, value, options } of cookies) {
          responseHeaders.append("Set-Cookie", serializeCookieHeader(name, value, options));
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          responseHeaders.set(key, value);
        }
      },
    },
  });
}

function currentEvent() {
  const event = getRequestEvent();
  if (!event) throw new Error("No request in scope. Call this from server code only.");
  return event;
}

/** Supabase client acting as the signed-in user, under RLS. */
export function supabaseForCurrentRequest(): SupabaseClient<Database> {
  const event = currentEvent();
  return supabaseForRequest(event.request, event.response.headers);
}

/** Who is making this request, verified against Supabase. Null when signed out. */
export async function viewerFromRequest(
  request: Request,
  responseHeaders: Headers,
): Promise<Viewer | null> {
  const supabase = supabaseForRequest(request, responseHeaders);
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    isAdmin: isAdminMetadata(claims.app_metadata),
  };
}

const VIEWER_KEY = Symbol("meridian.viewer");

/** Viewer for the current request, looked up once and cached on the request. */
export async function currentViewer(): Promise<Viewer | null> {
  const event = currentEvent();
  const locals = event.locals as Record<symbol, Promise<Viewer | null> | undefined>;
  locals[VIEWER_KEY] ??= viewerFromRequest(event.request, event.response.headers);
  return locals[VIEWER_KEY];
}
