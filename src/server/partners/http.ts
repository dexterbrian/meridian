import "server-only";
import type { Json } from "~/lib/database.types";
import { redact } from "~/lib/redact";
import { supabaseAdmin } from "../supabase";

// One logged HTTP call to a routed provider (Kotani, Yellow Card, Klasha,
// Minisend). Same shape as payazaCall: every call lands in partner_calls with
// secrets stripped, whatever happened.

export type PartnerResult<T> = { ok: boolean; status: number; data: T | null; text: string | null };

export async function partnerFetch<T = unknown>(input: {
  partner: string;
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  /** Already-serialised body, so a signature can be computed over the exact bytes. */
  body?: string;
  /** What to log as the request body (defaults to the parsed body). */
  logBody?: unknown;
  transactionId?: string | null;
}): Promise<PartnerResult<T>> {
  const started = Date.now();
  let status = 0;
  let data: T | null = null;
  let text: string | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(input.url, {
      method: input.method,
      headers: {
        Accept: "application/json",
        ...(input.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...input.headers,
      },
      body: input.body,
    });
    status = res.status;
    const raw = await res.text();
    try {
      data = raw ? (JSON.parse(raw) as T) : null;
    } catch {
      text = raw.slice(0, 2000);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const path = new URL(input.url).pathname;
  try {
    const logged = input.logBody ?? (input.body ? safeParse(input.body) : null);
    await supabaseAdmin()
      .from("partner_calls")
      .insert({
        partner: input.partner,
        endpoint: `${input.method} ${path}`,
        request: redact({ path, body: logged }) as Json,
        response: (data ?? { text, error }) as Json,
        status_code: status || null,
        duration_ms: Date.now() - started,
        transaction_id: input.transactionId ?? null,
      });
  } catch (e) {
    console.error(`[${input.partner}] could not log partner call`, e);
  }
  if (error) console.error(`[${input.partner}] ${input.method} ${path} failed: ${error}`);
  return { ok: status >= 200 && status < 300 && !error, status, data, text };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
