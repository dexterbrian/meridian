import type { APIEvent } from "@solidjs/start/server";
import { parseKotaniWebhook, verifyKotaniWebhook } from "~/lib/partner-webhooks";
import { env } from "~/server/env";
import { answer, json, parseJson } from "~/server/partners/routed-webhook";

// POST /api/webhooks/kotani. X-Kotani-Signature is sha256=HMAC of
// JSON.stringify({ event, data }) with the webhook secret from Kotani's dashboard.

export async function POST(event: APIEvent) {
  const raw = await event.request.text();
  const secret = env.kotaniWebhookSecret;
  if (!secret) return json(500, { ok: false, error: "not configured" });
  const body = parseJson(raw);
  if (body === undefined || typeof body !== "object" || body === null)
    return json(400, { ok: false, error: "not json" });
  const ok = await verifyKotaniWebhook(
    body as { event?: unknown; data?: unknown },
    event.request.headers.get("x-kotani-signature"),
    secret,
  );
  if (!ok) {
    console.error("[kotani webhook] bad signature");
    return json(401, { ok: false, error: "bad signature" });
  }
  return answer("kotani", body, parseKotaniWebhook);
}

export function GET() {
  return json(405, { ok: false, error: "POST only" });
}
