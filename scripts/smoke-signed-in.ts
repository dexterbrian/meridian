/* eslint-disable no-restricted-properties */
// Renders the signed-in pages against a running dev server to catch SSR errors.
//   npx vite-node --config scripts/vite.e2e.config.ts scripts/smoke-signed-in.ts http://localhost:3000
// Makes a throwaway user, signs in through /auth/callback with a magic link
// token, then fetches every /app page (and /admin as an admin) with the cookies.

import { readFileSync } from "node:fs";

for (const file of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i < 1 || line.startsWith("#")) continue;
      const k = line.slice(0, i).trim();
      if (!(k in process.env))
        process.env[k] = line
          .slice(i + 1)
          .trim()
          .replace(/^"|"$/g, "");
    }
  } catch {
    /* optional */
  }
}

const base = process.argv[2] ?? "http://localhost:3000";
const { supabaseAdmin } = await import("../src/server/supabase");
const db = supabaseAdmin();

const email = `smoke-${Date.now()}@example.test`;
const { data: created, error } = await db.auth.admin.createUser({
  email,
  email_confirm: true,
  app_metadata: { role: "admin" },
});
if (error || !created.user) throw new Error(error?.message);
const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email });
const tokenHash = link?.properties?.hashed_token;
if (!tokenHash) throw new Error("no token");

const cb = await fetch(`${base}/auth/callback?token_hash=${tokenHash}&type=magiclink&next=/app`, {
  redirect: "manual",
});
const cookies = cb.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
console.log(
  "callback",
  cb.status,
  cb.headers.get("location"),
  cookies ? "(cookies set)" : "(NO COOKIES)",
);

let failed = 0;
async function page(path: string, mustContain: string) {
  const r = await fetch(base + path, { headers: { cookie: cookies }, redirect: "manual" });
  const text = await r.text();
  const ok = r.status === 200 && text.includes(mustContain);
  if (!ok) failed++;
  console.log(ok ? "ok  " : "FAIL", r.status, path, ok ? "" : `missing "${mustContain}"`);
}

await page("/app", "Welcome to Meridian");
await page("/app/onboarding", "Your business");
await page("/app/settings/payout-accounts", "Payout accounts");
await page("/app/collect/new", "New payment request");
await page("/admin", "Payments and payouts");

// Give the user a business, then the dashboard should show the table.
await db.from("businesses").insert({
  owner_user_id: created.user.id,
  name: "Smoke Test Ltd",
  country: "KE",
  contact_email: email,
});
await page("/app", "No payment requests yet");
await page("/app/collect/new", "Amount you receive");

const { data: paid } = await db
  .from("payment_requests")
  .select("reference")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (paid) {
  const { data: tx } = await db
    .from("transactions")
    .select("id")
    .eq("reference", `${paid.reference}-1`)
    .maybeSingle();
  if (tx) await page(`/admin/transactions/${tx.id}`, paid.reference);
}

console.log(failed ? `\n✗ ${failed} page(s) failed` : "\n✓ signed-in pages render");
process.exit(failed ? 1 : 0);
