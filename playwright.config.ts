import { defineConfig, devices } from "@playwright/test";

// Browser tests against a dev server on its own port, in sandbox mode, with no
// provider keys, so prices are published fees and execution is simulated.
// Needs the local Supabase stack running (npx supabase start).
//   npm run test:e2e

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  // The full Chromium build (new headless mode), not the separate headless shell.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chromium" } }],
  webServer: {
    command: `npx vite dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      MERIDIAN_MODE: "sandbox",
      // Nothing to fail into: Kotani Pay is the only routed provider switched
      // on, so no payment has a second provider to fall back to. Set this to the
      // cheapest provider again once a second one is back on.
      PARTNER_SIMULATE_FAIL: "",
      // Lets the tests send Kotani webhooks signed like the real ones.
      KOTANI_WEBHOOK_SECRET: "e2e-kotani-secret",
      // No emails from test runs.
      RESEND_API_KEY: "",
      // No provider keys: every routed provider gives estimates and simulated
      // execution, so a run never depends on a live provider account. Every
      // credential name env.ts reads has to be cleared here, or a key in
      // .env.local leaks in and the prices stop being predictable.
      KOTANI_API_KEY: "",
      KOTANI_PAY_PUBLIC_KEY: "",
      // KOTANI_WEBHOOK_SECRET is set above to the test one, not cleared: with no
      // public key the adapter still runs offline, and the tests need to sign.
      KOTANI_PAY_SECRET_KEY: "",
      YELLOWCARD_API_KEY: "",
      YELLOWCARD_SECRET: "",
      KLASHA_USERNAME: "",
      KLASHA_PASSWORD: "",
      KLASHA_PUBLIC_KEY: "",
      KLASHA_ENCRYPTION_KEY: "",
      KLASHA_BUSINESS_ID: "",
      PASSPOINT_MERCHANT_ID: "",
      PASSPOINT_API_KEY: "",
      PASSPOINT_USER_APP_CONTEXT: "",
    },
  },
});
