import type { APIEvent } from "@solidjs/start/server";
import { parseYellowCardWebhook, verifyYellowCardWebhook } from "~/lib/partner-webhooks";
import { env } from "~/server/env";
import { answer, json, parseJson } from "~/server/partners/routed-webhook";

// POST /api/webhooks/yellowcard. X-YC-Signature is the base64 HMAC-SHA256 of
// the raw body with the API key's secret. Set this URL in Yellow Card's portal.

export async function POST(event: APIEvent) {
  const raw = await event.request.text();
  const yc = env.yellowcard;
  if (!yc) return json(500, { ok: false, error: "not configured" });
  if (
    !(await verifyYellowCardWebhook(raw, event.request.headers.get("x-yc-signature"), yc.secret))
  ) {
    console.error("[yellowcard webhook] bad signature");
    return json(401, { ok: false, error: "bad signature" });
  }
  const body = parseJson(raw);
  if (body === undefined) return json(400, { ok: false, error: "not json" });
  return answer("yellowcard", body, parseYellowCardWebhook);
}

export function GET() {
  return json(405, { ok: false, error: "POST only" });
}
