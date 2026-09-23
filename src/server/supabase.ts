import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/database.types";
import { env } from "./env";

// Service-role client. Bypasses RLS. Only for server code that has already
// checked who is asking. Lint blocks importing this file outside src/server.

let admin: SupabaseClient<Database> | undefined;

export function supabaseAdmin(): SupabaseClient<Database> {
  admin ??= createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}
