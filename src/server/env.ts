import "server-only";

// Server-side configuration. Read lazily so a missing optional key (for example
// RESEND_API_KEY on a laptop) only fails the feature that needs it.

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export function requireEnv(name: string): string {
  const value = read(name);
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return requireEnv("SUPABASE_URL");
  },
  get supabasePublishableKey() {
    return requireEnv("SUPABASE_PUBLISHABLE_KEY");
  },
  get supabaseServiceRoleKey() {
    return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  get resendApiKey() {
    return read("RESEND_API_KEY");
  },
  get emailFrom() {
    return read("EMAIL_FROM") ?? "Meridian <onboarding@resend.dev>";
  },
  get adminEmail() {
    return read("ADMIN_EMAIL");
  },
  get appUrl() {
    return read("APP_URL") ?? "http://localhost:3000";
  },
  get mode(): "sandbox" | "live" {
    return read("MERIDIAN_MODE") === "live" ? "live" : "sandbox";
  },
  get jobsSecret() {
    return read("JOBS_SECRET");
  },

  // Payaza. The public key authenticates API calls (base64, "Payaza" prefix) and
  // is the merchant_key for Web Checkout. The secret key only signs webhooks and
  // never leaves the server.
  get payazaPublicKey() {
    return requireEnv("PAYAZA_PUBLIC_KEY");
  },
  get payazaSecretKey() {
    return requireEnv("PAYAZA_SECRET_KEY");
  },
  get payazaBaseUrl() {
    return (read("PAYAZA_BASE_URL") ?? "https://api.payaza.africa/live").replace(/\/+$/, "");
  },
  /** 6-digit PIN that authorises Transfers. Server only, never logged. */
  get payazaTransactionPin() {
    return read("PAYAZA_TRANSACTION_PIN");
  },
  /**
   * Sandbox only. Payaza's test merchant has no payout float, so Transfers cannot
   * succeed there. With this on, a payout is marked settled without calling Payaza
   * and the timeline says so. Ignored in live mode.
   */
  get payazaSimulatePayouts() {
    return this.mode === "sandbox" && read("PAYAZA_SIMULATE_PAYOUTS") === "true";
  },
};
