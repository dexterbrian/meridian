import { createHash, randomBytes } from "node:crypto";

// Rules for the waitlist's "Confirm my place" email. Pure functions, so they
// are unit tested; public-actions.ts does the database and email work.

export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_CONFIRM_EMAILS_PER_DAY = 3;
/** A person can't fill the form faster than this. Bots usually do. */
export const MIN_FILL_MS = 3_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A random token for the email link. Only its hash is stored. */
export function newConfirmToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Spam checks people never see: a hidden field only bots fill in, and a form
 * sent faster than anyone could type it. `renderedAt` is 0 when the browser
 * didn't run the page's script, and then the timing check is skipped.
 */
export function looksLikeABot(
  input: { website?: string; renderedAt?: number },
  now: number,
): boolean {
  if (input.website && input.website.trim() !== "") return true;
  const renderedAt = input.renderedAt ?? 0;
  return renderedAt > 0 && now - renderedAt < MIN_FILL_MS;
}

/**
 * Whether another confirmation email may go out. At most 3 in any 24 hours,
 * so the form can't be used to flood someone's inbox. The count resets once
 * a day has passed since the last email.
 */
export function confirmEmailAllowance(
  row: { confirm_emails_sent: number; last_confirm_sent_at: string | null },
  now: number,
): { send: boolean; sentInWindow: number } {
  const last = row.last_confirm_sent_at ? new Date(row.last_confirm_sent_at).getTime() : 0;
  const sentInWindow = now - last > DAY_MS ? 0 : row.confirm_emails_sent;
  return { send: sentInWindow < MAX_CONFIRM_EMAILS_PER_DAY, sentInWindow };
}

export function linkExpired(row: { confirm_expires_at: string | null }, now: number): boolean {
  return row.confirm_expires_at !== null && new Date(row.confirm_expires_at).getTime() < now;
}

/** A token is base64url, 43 characters. Anything else is not ours. */
export function isTokenShaped(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(token);
}
