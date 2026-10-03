/* eslint-disable no-restricted-properties */
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { FullConfig } from "@playwright/test";
import type { Database } from "../src/lib/database.types";
import { loadLocalEnv } from "./env";

// Makes a throwaway business owner with a KES M-Pesa payout account and an open
// KES payment request, signs them in through /auth/callback, and saves the
// session for the signed-in tests. Local Supabase only.

export const STATE = "e2e/.auth/state.json";
export const DATA = "e2e/.auth/data.json";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const reference = () =>
  "MRD-" + Array.from({ length: 8 }, () => ALPHABET[Math.floor(Math.random() * 32)]).join("");

export default async function globalSetup(config: FullConfig) {
  loadLocalEnv();
  const url = process.env["SUPABASE_URL"] ?? "";
  if (!/127\.0\.0\.1|localhost/.test(url))
    throw new Error(`Browser tests run against local Supabase only, not ${url}`);
  const db = createClient<Database>(url, process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const base = config.projects[0]!.use.baseURL!;

  const email = `e2e-${Date.now()}@example.test`;
  const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created.user) throw new Error(`createUser: ${error?.message}`);

  const { data: business, error: bErr } = await db
    .from("businesses")
    .insert({
      owner_user_id: created.user.id,
      name: "Kilimo Fresh Exports Ltd",
      country: "KE",
      contact_email: email,
      kyb_status: "verified",
    })
    .select()
    .single();
  if (bErr || !business) throw new Error(`business: ${bErr?.message}`);

  const { error: aErr } = await db.from("payout_accounts").insert({
    business_id: business.id,
    currency: "KES",
    country: "KE",
    method: "momo",
    details: {
      bank_code: "SAFKEN",
      bank_name: "M-Pesa",
      account_number: "254712345678",
      account_name: "Kilimo Fresh Exports Ltd",
    },
    validated: true,
    is_default: true,
  });
  if (aErr) throw new Error(`payout account: ${aErr.message}`);

  const requests: string[] = [];
  for (let i = 0; i < 2; i++) {
    const ref = reference();
    const { error: rErr } = await db.from("payment_requests").insert({
      business_id: business.id,
      reference: ref,
      amount: 129000,
      currency: "KES",
      memo: "Avocados, shipment 14",
    });
    if (rErr) throw new Error(`request: ${rErr.message}`);
    requests.push(ref);
  }

  const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (!tokenHash) throw new Error("no magic link token");
  const cb = await fetch(`${base}/auth/callback?token_hash=${tokenHash}&type=magiclink&next=/app`, {
    redirect: "manual",
  });
  const cookies = cb.headers.getSetCookie().map((c) => {
    const [pair] = c.split(";");
    const i = pair!.indexOf("=");
    return {
      name: pair!.slice(0, i),
      value: pair!.slice(i + 1),
      domain: "localhost",
      path: "/",
      expires: -1,
      httpOnly: /httponly/i.test(c),
      secure: false,
      sameSite: "Lax" as const,
    };
  });
  if (cookies.length === 0) throw new Error(`sign-in set no cookies (HTTP ${cb.status})`);

  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync(STATE, JSON.stringify({ cookies, origins: [] }));
  writeFileSync(DATA, JSON.stringify({ email, requests }));
}
