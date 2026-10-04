import "server-only";
import type { RoutedEvent } from "~/lib/partner-webhooks";
import { handleRoutedEvent } from "../money/routed";

// Shared tail of the routed-provider webhook routes: parse, hand to the state
// machine, answer. Each route checks its provider's signature first.

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function answer(
  provider: string,
  body: unknown,
  parse: (body: unknown) => RoutedEvent | null,
): Promise<Response> {
  const event = parse(body);
  if (!event) return json(200, { ok: true, ignored: "unrecognised event" });
  try {
    const result = await handleRoutedEvent(event, body);
    if (result === "unknown_reference") return json(404, { ok: false, error: "unknown reference" });
    return json(200, { ok: true, result });
  } catch (e) {
    // A 5xx makes the provider retry, which is what we want after a crash.
    console.error(`[${provider} webhook] failed`, e);
    return json(500, { ok: false, error: "failed" });
  }
}

export function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
