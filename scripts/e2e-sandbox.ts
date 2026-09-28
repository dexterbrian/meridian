/* eslint-disable no-restricted-properties */
// End-to-end check of the collection flow against Payaza's sandbox and the
// local Supabase. Not a unit test: it moves sandbox "money" and writes rows.
//
//   npx vite-node --config vitest.config.ts scripts/e2e-sandbox.ts
//
// Steps: make a test user and business with a KES payout account, create a
// request, start a mobile money attempt, play the payer approving, and watch
// the transaction go awaiting_payin -> collected -> paying_out -> settled.
// Then replay the "paid" event to show it changes nothing.

import { readFileSync } from "node:fs";

for (const file of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i < 1 || line.startsWith("#")) continue;
      const k = line.slice(0, i).trim();
      const v = line
        .slice(i + 1)
        .trim()
        .replace(/^"|"$/g, "");
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* optional file */
  }
}

const { supabaseAdmin } = await import("../src/server/supabase");
const collect = await import("../src/server/money/collect");
const { quoteCollection } = await import("../src/lib/fees");

const db = supabaseAdmin();
const log = (...a: unknown[]) => console.log("•", ...a);
const fail = (m: string) => {
  console.error("✗", m);
  process.exit(1);
};

// 1. A user and a business.
const email = `e2e-${Date.now()}@example.test`;
const { data: user, error: userErr } = await db.auth.admin.createUser({
  email,
  email_confirm: true,
});
if (userErr || !user.user) fail(`createUser: ${userErr?.message}`);
const { data: biz } = await db
  .from("businesses")
  .insert({
    owner_user_id: user!.user.id,
    name: "Ann Flowers Ltd",
    trading_name: "Ann Flowers",
    country: "KE",
    contact_email: email,
  })
  .select()
  .single();
if (!biz) fail("business insert");
log("business", biz!.id);

const { data: account } = await db
  .from("payout_accounts")
  .insert({
    business_id: biz!.id,
    currency: "KES",
    country: "KE",
    method: "momo",
    details: {
      bank_code: "SAFKEN",
      bank_name: "M-Pesa",
      account_number: "254712345678",
      account_name: "Ann Flowers Ltd",
    },
    validated: true,
  })
  .select()
  .single();
if (!account) fail("payout account insert");

// 2. A request for KES 650,000 with the business's own invoice number.
const { makeReference } = await import("../src/lib/reference");
const reference = makeReference();
const { data: request } = await db
  .from("payment_requests")
  .insert({
    business_id: biz!.id,
    reference,
    invoice_number: "AF-0917",
    amount: 650000,
    currency: "KES",
    memo: "Roses, 40 boxes, week 39",
    usage: "single",
  })
  .select()
  .single();
if (!request) fail("request insert");
log("request", reference);

const pub = await collect.loadPublicRequest(reference);
if (!pub || pub.businessName !== "Ann Flowers" || pub.invoiceNumber !== "AF-0917")
  fail("loadPublicRequest");
log("pay page sees", pub!.businessName, pub!.amount, pub!.currency, pub!.invoiceNumber);

// 3. The payer starts a mobile money attempt. Payaza is called for real (sandbox).
const start = await collect.startAttempt({
  reference,
  method: "momo",
  payer_name: "Kwame Mensah",
  payer_email: "kwame@example.test",
  payer_phone: "254712345678",
  payer_country: "GH",
  network: "SAFKEN",
  origin: "http://localhost:3000",
});
const q = quoteCollection(650000, "momo", "KES");
if (start.reference !== `${reference}-1`) fail(`attempt reference ${start.reference}`);
if (start.totalCharged !== q.payerPays) fail("total charged");
if (start.payin?.kind !== "momo") fail("payin kind");
log("attempt", start.reference, "payer charged", start.totalCharged, "status", start.status);

// A second click on Pay must not reuse attempt 1.
const second = await collect.startAttempt({
  reference,
  method: "momo",
  payer_name: "Kwame Mensah",
  payer_email: "kwame@example.test",
  payer_phone: "254712345678",
  payer_country: "GH",
  network: "SAFKEN",
  origin: "http://localhost:3000",
});
if (second.reference !== `${reference}-2`) fail(`second attempt reference ${second.reference}`);
log("second click made its own attempt", second.reference);

// 4. The payer approves on the phone (sandbox funding), and reconciliation runs the webhook path.
await collect.simulatePayerApproval(start.transactionId);
const view = await collect.attemptView(start.transactionId);
log("after approval", view?.status, view?.payoutSimulated ? "(payout simulated)" : "");
if (view?.status !== "settled") fail(`expected settled, got ${view?.status}`);

// 5. Idempotency: the same Payaza event again changes nothing.
const replay = await collect.handleCollectionOutcome({
  reference: start.reference,
  outcome: "success",
  facts: {
    amountReceived: q.payerPays,
    fee: 0,
    currency: "KES",
    payerName: "Kwame",
    partnerReference: null,
  },
  source: "payaza_webhook",
  payload: { replay: true },
});
if (replay !== "duplicate") fail(`replay should be duplicate, got ${replay}`);
log("replayed webhook ->", replay);

// 6. The request is paid, single use, so attempt 2 can no longer be charged.
const { data: pr } = await db.from("payment_requests").select().eq("id", request!.id).single();
if (pr?.status !== "paid" || pr.paid_count !== 1) fail(`request ${pr?.status} ${pr?.paid_count}`);
log("request now", pr!.status, "paid_count", pr!.paid_count);

// If attempt 2 were to succeed now, it must be held, not paid out.
const late = await collect.handleCollectionOutcome({
  reference: second.reference,
  outcome: "success",
  facts: {
    amountReceived: q.payerPays,
    fee: 0,
    currency: "KES",
    payerName: "Kwame",
    partnerReference: null,
  },
  source: "payaza_webhook",
  payload: { late: true },
  confirmed: true,
});
const lateTx = await collect.attemptView(second.transactionId);
if (late !== "ok" || lateTx?.status !== "held")
  fail(`late payment should be held, got ${late} ${lateTx?.status}`);
log("late payment on a paid request ->", lateTx!.status);

// 7. Trying a third attempt is refused by the database.
try {
  await collect.startAttempt({
    reference,
    method: "momo",
    payer_name: "X",
    payer_email: "x@example.test",
    payer_phone: "254712345678",
    payer_country: "KE",
    network: "SAFKEN",
    origin: "http://localhost:3000",
  });
  fail("third attempt should have been refused");
} catch (e) {
  log("third attempt refused:", (e as Error).message);
}

const { data: events } = await db
  .from("transaction_events")
  .select("source, from_status, to_status, idempotency_key")
  .eq("transaction_id", start.transactionId)
  .order("created_at");
log("events for attempt 1:");
for (const e of events ?? [])
  console.log(
    "   ",
    e.source,
    e.from_status ?? "—",
    "→",
    e.to_status ?? "—",
    `[${e.idempotency_key}]`,
  );
const { data: calls } = await db
  .from("partner_calls")
  .select("endpoint, status_code, duration_ms")
  .eq("transaction_id", start.transactionId)
  .order("created_at");
log("Payaza calls for attempt 1:");
for (const c of calls ?? []) console.log("   ", c.endpoint, c.status_code, `${c.duration_ms}ms`);

console.log("\n✓ end-to-end sandbox flow passed");
process.exit(0);
