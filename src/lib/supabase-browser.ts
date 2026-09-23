import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Browser client with the publishable (anon) key. Reads run under RLS as the
// signed-in user, whose session is in the same cookies the server reads.
// Values come from VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY at build time.

let client: SupabaseClient<Database> | undefined;

export function supabaseBrowser(): SupabaseClient<Database> {
  const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;
  if (!url || !key) {
    throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. See .env.example.");
  }
  client ??= createBrowserClient<Database>(url, key);
  return client;
}
