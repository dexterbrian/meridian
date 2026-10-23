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

  // Routed providers (src/lib/providers.ts). A provider without its keys gives
  // sandbox estimates and simulated execution in sandbox mode, and is skipped in live.
  get kotani() {
    // The dashboard issues a key pair. The key goes in Authorization: Bearer
    // (v3 does not sign requests); the secret signs their webhooks. The older
    // KOTANI_API_KEY name still works.
    const apiKey = read("KOTANI_PAY_PUBLIC_KEY") ?? read("KOTANI_API_KEY");
    return apiKey
      ? {
          apiKey,
          // Checked against the live sandbox on 13 October 2026: the host is
          // kotanipay.com, not .io, and v3 routes sit under /api/v3. Kotani gives
          // each account its own environment URLs, so this is only a default.
          baseUrl: (read("KOTANI_BASE_URL") ?? "https://sandbox-api.kotanipay.com/api/v3").replace(
            /\/+$/,
            "",
          ),
        }
      : null;
  },
  /**
   * Kotani holds Meridian's money in a wallet per currency, and both taking a
   * payment in and paying one out name that wallet. Set as
   * KOTANI_WALLETS="KES:abc123,GHS:def456"; a currency with no wallet cannot be
   * carried by Kotani at all, and the payer is told so.
   */
  kotaniWallet(currency: string): string | null {
    const raw = read("KOTANI_WALLETS") ?? "";
    for (const part of raw.split(",")) {
      const [code, id] = part.split(":");
      if (code?.trim().toUpperCase() === currency.toUpperCase() && id?.trim()) return id.trim();
    }
    return read(`KOTANI_WALLET_${currency.toUpperCase()}`) ?? null;
  },
  get yellowcard() {
    const apiKey = read("YELLOWCARD_API_KEY");
    const secret = read("YELLOWCARD_SECRET");
    return apiKey && secret
      ? {
          apiKey,
          secret,
          baseUrl: (read("YELLOWCARD_BASE_URL") ?? "https://sandbox.api.yellowcard.io").replace(
            /\/+$/,
            "",
          ),
          businessId: read("YELLOWCARD_BUSINESS_ID") ?? "",
        }
      : null;
  },
  get klasha() {
    const username = read("KLASHA_USERNAME");
    const password = read("KLASHA_PASSWORD");
    const publicKey = read("KLASHA_PUBLIC_KEY");
    const encryptionKey = read("KLASHA_ENCRYPTION_KEY");
    return username && password && publicKey && encryptionKey
      ? {
          username,
          password,
          publicKey,
          encryptionKey,
          baseUrl: (read("KLASHA_BASE_URL") ?? "https://dev.kcp-api.klasha.com").replace(
            /\/+$/,
            "",
          ),
        }
      : null;
  },
  // Webhook secrets, separate from the API keys: a webhook can arrive (and must
  // be checked) whatever else is configured. Yellow Card signs with the API
  // key's own secret, so it has none of its own.
  get kotaniWebhookSecret() {
    // The key pair's secret is what signs Kotani's webhooks, unless the
    // dashboard issued a separate webhook secret.
    return read("KOTANI_WEBHOOK_SECRET") ?? read("KOTANI_PAY_SECRET_KEY");
  },
  /** Klasha doesn't sign webhooks, so the URL we give it carries this token. */
  get klashaWebhookToken() {
    return read("KLASHA_WEBHOOK_TOKEN");
  },
  /**
   * Sandbox only: providers whose simulated execution should fail, comma separated
   * (e.g. "yellowcard"). Lets tests and demos show a fallback. Ignored in live mode.
   */
  get simulateFailures(): string[] {
    if (this.mode !== "sandbox") return [];
    return (read("PARTNER_SIMULATE_FAIL") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
};
