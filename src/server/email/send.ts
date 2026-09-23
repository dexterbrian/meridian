import "server-only";
import { Resend } from "resend";
import { redact } from "~/lib/redact";
import type { Json } from "~/lib/database.types";
import { env } from "../env";
import { supabaseAdmin } from "../supabase";
import { emailFailureAlert, type Email } from "./templates";

// The one way the app sends email. Failures are never swallowed: each one is
// written to partner_calls (partner = 'resend') and the admin gets an alert.

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

type Message = Email & { to: string | string[]; replyTo?: string };

let client: Resend | undefined;

async function deliver(message: Message): Promise<SendResult> {
  const key = env.resendApiKey;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set" };
  client ??= new Resend(key);
  try {
    const { data, error } = await client.emails.send({
      from: env.emailFrom,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
    if (error || !data) return { ok: false, error: error?.message ?? "No response from Resend" };
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function logFailure(message: Message, error: string, durationMs: number) {
  try {
    await supabaseAdmin()
      .from("partner_calls")
      .insert({
        partner: "resend",
        endpoint: "emails.send",
        request: redact({ to: message.to, subject: message.subject }) as Json,
        response: { error },
        status_code: null,
        duration_ms: durationMs,
      });
  } catch (e) {
    console.error("[email] could not log failure to partner_calls", e);
  }
}

export async function sendEmail(message: Message): Promise<SendResult> {
  const started = Date.now();
  const result = await deliver(message);
  if (result.ok) return result;

  console.error(`[email] send failed: ${result.error} (subject: ${message.subject})`);
  await logFailure(message, result.error, Date.now() - started);

  // Tell the admin, unless the admin alert itself is what failed.
  const admin = env.adminEmail;
  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  if (admin && !recipients.includes(admin)) {
    const alert = await deliver({
      ...emailFailureAlert({
        to: recipients.join(", "),
        subject: message.subject,
        error: result.error,
      }),
      to: admin,
    });
    if (!alert.ok) console.error(`[email] admin alert also failed: ${alert.error}`);
  }
  return result;
}

/** Internal lead email to Appify. Skipped, with a log line, when ADMIN_EMAIL is not set. */
export async function sendToAdmin(email: Email, replyTo?: string): Promise<SendResult> {
  const admin = env.adminEmail;
  if (!admin) {
    console.error("[email] ADMIN_EMAIL is not set; lead alert not sent");
    return { ok: false, error: "ADMIN_EMAIL is not set" };
  }
  return sendEmail({ ...email, to: admin, ...(replyTo ? { replyTo } : {}) });
}
