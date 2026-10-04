import type { APIEvent } from "@solidjs/start/server";
import { parseMinisendWebhook, verifyMinisendWebhook } from "~/lib/partner-webhooks";
import { env } from "~/server/env";
import { answer, json, parseJson } from "~/server/partners/routed-webhook";

// POST /api/webhooks/minisend. Prefers the timestamped X-Minisend-Signature-V2
// (5 minute tolerance), else X-Minisend-Signature over the raw body.

export async function POST(event: APIEvent) {
  const raw = await event.request.text();
  const secret = env.minisendWebhookSecret;
  if (!secret) return json(500, { ok: false, error: "not configured" });
  const ok = await verifyMinisendWebhook(
    raw,
    {
      v1: event.request.headers.get("x-minisend-signature"),
      v2: event.request.headers.get("x-minisend-signature-v2"),
    },
    secret,
  );
  if (!ok) {
    console.error("[minisend webhook] bad signature");
    return json(401, { ok: false, error: "bad signature" });
  }
  const body = parseJson(raw);
  if (body === undefined) return json(400, { ok: false, error: "not json" });
  return answer("minisend", body, parseMinisendWebhook);
}

export function GET() {
  return json(405, { ok: false, error: "POST only" });
}
