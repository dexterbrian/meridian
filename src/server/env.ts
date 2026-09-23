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
};
