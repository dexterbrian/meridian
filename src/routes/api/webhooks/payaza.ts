import type { APIEvent } from "@solidjs/start/server";
import { parsePayazaWebhook, verifyPayazaSignature } from "~/lib/payaza-webhook";
import { env } from "~/server/env";
import { handleCollectionOutcome, handleTransferOutcome } from "~/server/money/collect";

// POST /api/webhooks/payaza (TRD 4.2, 6.4).
//   1. Read the raw body and check x-payaza-signature (HMAC SHA512, secret key).
//   2. Parse it into a collection or transfer event.
//   3. Hand it to the state machine, which logs it first (idempotent) and then
//      confirms with Payaza's status query before changing anything.
//
// Locally the URL is an ngrok tunnel; on Vercel it is
// https://meridian.appify.co.ke/api/webhooks/payaza. Set it in the Payaza
// dashboard under Settings, Developers, for both collections and payouts.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function POST(event: APIEvent) {
  const raw = await event.request.text();
  const signature = event.request.headers.get("x-payaza-signature");

  let secret: string;
  try {
    secret = env.payazaSecretKey;
  } catch {
    console.error("[payaza webhook] PAYAZA_SECRET_KEY is not set");
    return json(500, { ok: false, error: "not configured" });
  }
  if (!(await verifyPayazaSignature(raw, signature, secret))) {
    console.error("[payaza webhook] bad signature");
    return json(401, { ok: false, error: "bad signature" });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: "not json" });
  }
  const parsed = parsePayazaWebhook(body);
  if (!parsed) return json(200, { ok: true, ignored: "unrecognised event" });

  const result =
    parsed.kind === "collection"
      ? await handleCollectionOutcome({
          reference: parsed.reference,
          outcome: parsed.outcome,
          facts: {
            amountReceived: parsed.amountReceived,
            fee: parsed.fee,
            currency: parsed.currency,
            payerName: parsed.payerName,
            partnerReference: parsed.partnerReference,
          },
          source: "payaza_webhook",
          payload: body,
        })
      : await handleTransferOutcome({
          reference: parsed.reference,
          outcome: parsed.outcome,
          fee: parsed.fee,
          message: parsed.responseMessage,
          source: "payaza_webhook",
          payload: body,
        });

  if (result === "unknown_reference") return json(404, { ok: false, error: "unknown reference" });
  return json(200, { ok: true, result });
}

export function GET() {
  return json(405, { ok: false, error: "POST only" });
}
