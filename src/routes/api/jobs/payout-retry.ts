import type { APIEvent } from "@solidjs/start/server";
import { timingSafeEqual } from "~/lib/payaza-webhook";
import { env } from "~/server/env";
import { runPayoutRetry } from "~/server/money/collect";

// /api/jobs/payout-retry (TRD 11). Hit by a cron every 10 minutes with
// `Authorization: Bearer JOBS_SECRET`. Vercel Cron sends GET with
// `Authorization: Bearer CRON_SECRET`, so on Vercel set CRON_SECRET to the same
// value as JOBS_SECRET (vercel.json holds the schedule).

async function run(event: APIEvent) {
  const secret = env.jobsSecret;
  const header = event.request.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(header, `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await runPayoutRetry();
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[jobs] payout-retry failed", e);
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
}

export const GET = run;
export const POST = run;
