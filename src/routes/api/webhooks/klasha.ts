import type { APIEvent } from "@solidjs/start/server";
import { timingSafeEqual } from "~/lib/partner-webhooks";
import { parseKlashaWebhook } from "~/lib/partner-webhooks";
import { env } from "~/server/env";
import { answer, json, parseJson } from "~/server/partners/routed-webhook";

// POST /api/webhooks/klasha?token=... Klasha documents no webhook signature, so
// the URL set in Klasha's dashboard carries KLASHA_WEBHOOK_TOKEN. An event can
// also only move a payout whose Klasha reference we were given when it started.

export async function POST(event: APIEvent) {
  const token = env.klashaWebhookToken;
  if (!token) return json(500, { ok: false, error: "not configured" });
  const given = new URL(event.request.url).searchParams.get("token") ?? "";
  if (!timingSafeEqual(given, token)) {
    console.error("[klasha webhook] bad token");
    return json(401, { ok: false, error: "bad token" });
  }
  const body = parseJson(await event.request.text());
  if (body === undefined) return json(400, { ok: false, error: "not json" });
  return answer("klasha", body, parseKlashaWebhook);
}

export function GET() {
  return json(405, { ok: false, error: "POST only" });
}
