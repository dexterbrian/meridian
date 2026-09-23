"use server";

import { z } from "zod";
import { safeNext, type Viewer } from "~/lib/auth-rules";
import { currentViewer, supabaseForCurrentRequest } from "./auth";
import { RATE_LIMITED, allowRequest, requestOrigin } from "./request";

// Sign-in with a one-time code sent by email (Supabase email OTP).
// The email also carries a link; clicking it lands on /auth/callback.

export type AuthResult = { ok: true } | { ok: false; error: string };

export async function getViewer(): Promise<Viewer | null> {
  return currentViewer();
}

export async function getAdminViewer(): Promise<Viewer | null> {
  const viewer = await currentViewer();
  return viewer?.isAdmin ? viewer : null;
}

const emailSchema = z.email("Enter a valid email").max(254);

export async function requestSignInCode(email: string, next: string): Promise<AuthResult> {
  const parsed = emailSchema.safeParse(email.trim().toLowerCase());
  if (!parsed.success) return { ok: false, error: "Enter a valid email" };
  if (!allowRequest("signIn")) return { ok: false, error: RATE_LIMITED };

  const redirectTo = new URL("/auth/callback", requestOrigin());
  redirectTo.searchParams.set("next", safeNext(next));
  const { error } = await supabaseForCurrentRequest().auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo.toString() },
  });
  if (error) {
    console.error("[auth] signInWithOtp failed", error.message);
    return { ok: false, error: "We couldn't send a code. Please try again in a minute." };
  }
  return { ok: true };
}

export async function verifySignInCode(email: string, code: string): Promise<AuthResult> {
  const token = code.replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token)) return { ok: false, error: "Enter the code from the email" };
  if (!allowRequest("signIn")) return { ok: false, error: RATE_LIMITED };

  const { error } = await supabaseForCurrentRequest().auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token,
    type: "email",
  });
  if (error) return { ok: false, error: "That code is wrong or has expired." };
  return { ok: true };
}

export async function signOut(): Promise<AuthResult> {
  await supabaseForCurrentRequest().auth.signOut();
  return { ok: true };
}
