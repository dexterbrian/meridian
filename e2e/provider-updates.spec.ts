import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Provider webhooks and transfer checks, through Kotani Pay: the only routed
// provider switched on (ENABLED_PROVIDERS in src/lib/providers.ts). The test
// server knows the Kotani webhook secret (playwright.config.ts), so these tests
// can sign a webhook the way Kotani does.

const SECRET = "e2e-kotani-secret";
const data = () =>
  JSON.parse(readFileSync("e2e/.auth/data.json", "utf8")) as { requests: string[] };

/** Kotani signs the hex HMAC of {event, data}, prefixed "sha256=". */
function signed(body: { event: string; data: Record<string, unknown> }, secret = SECRET) {
  const raw = JSON.stringify(body);
  const signature = createHmac("sha256", secret)
    .update(JSON.stringify({ event: body.event, data: body.data }))
    .digest("hex");
  return {
    raw,
    headers: { "content-type": "application/json", "x-kotani-signature": `sha256=${signature}` },
  };
}

/**
 * Picks how to pay and waits for a price. The select is retried because the
 * first load of a dev server can render before it is hydrated, and an unhydrated
 * select takes the choice without asking for a quote.
 */
async function payWith(page: Page, label: string) {
  await expect(page.getByLabel("Currency and way to pay")).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await page.getByLabel("Currency and way to pay").selectOption({ label });
    await expect(page.getByTestId("route-quote").first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
}

test.describe("provider webhooks", () => {
  test("a signed Kotani onramp settles the payment; a forged one is refused", async ({ page }) => {
    await page.goto(`/pay/${data().requests[2]}`);
    await payWith(page, "GHS · Mobile money (Ghana)");
    await expect(page.getByTestId("route-quote").first()).toHaveAttribute(
      "data-provider",
      "kotani",
    );
    await page.getByLabel("Your name").fill("Abena Osei");
    await page.getByLabel("Email").fill("abena@example.test");
    await page.getByLabel("Your country").selectOption("GH");
    await page.getByLabel("Phone").fill("233244777666");
    await page.getByRole("button", { name: /with Kotani Pay$/ }).click();
    await expect(page.getByTestId("routed-payin")).toContainText("Carried by Kotani Pay");

    const attempt = new URL(page.url()).searchParams.get("attempt");
    expect(attempt).toBeTruthy();
    const reference = (await page
      .getByText(/^MRD-[A-Z2-9]{8}-\w+$/)
      .first()
      .textContent())!.trim();

    // The payer's money reaching our Kotani wallet is the onramp. Kotani then pays the
    // business out, which in a test run with no keys is simulated.
    const body = {
      event: "transaction.onramp.status.updated",
      data: {
        referenceId: reference,
        depositStatus: "SUCCESSFUL",
        onchainStatus: "SUCCESSFUL",
        id: `kot-${Date.now()}`,
      },
    };

    // Wrong secret: refused, nothing moves.
    const bad = signed(body, "not-the-secret");
    const forged = await page.request.post("/api/webhooks/kotani", {
      data: bad.raw,
      headers: bad.headers,
    });
    expect(forged.status()).toBe(401);

    const { raw, headers } = signed(body);
    const ok = await page.request.post("/api/webhooks/kotani", { data: raw, headers });
    expect(ok.status()).toBe(200);
    // The same event again changes nothing.
    const again = await page.request.post("/api/webhooks/kotani", { data: raw, headers });
    expect(await again.json()).toMatchObject({ result: "duplicate" });

    await expect(page.getByRole("heading", { name: "Paid and settled" })).toBeVisible();
  });
});

test.describe("checks on supplier transfers", () => {
  test.use({ storageState: "e2e/.auth/state.json" });

  test("a large first payment to a new supplier is held for review after the business pays", async ({
    page,
  }) => {
    await page.goto("/app/send");
    await expect(async () => {
      await page.getByRole("button", { name: "New" }).click();
      await expect(page.getByTestId("recipient-form")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    const form = page.getByTestId("recipient-form");
    await form.getByLabel("Recipient name").fill("Kumasi Machinery Ltd");
    await form.getByLabel("Country").selectOption({ label: "Ghana" });
    await form.getByLabel("Paid by").selectOption({ label: "Mobile money" });
    await form.getByLabel("Account number").fill("233244999888");
    await form.getByLabel("Network").fill("MTN");
    await form.getByRole("button", { name: "Save recipient" }).click();
    await expect(page.getByLabel("Recipient", { exact: true })).toHaveValue(/[0-9a-f-]{36}/);

    // GH₵200,000 is about USD 13,200: over the USD 10,000 line, to a recipient never paid before.
    await page.getByLabel("Amount the recipient gets").fill("200000");
    await page.getByLabel("Pay from").selectOption("KES|momo");
    await page.getByRole("button", { name: "Compare prices" }).click();
    await page.getByRole("button", { name: /with Kotani Pay$/ }).click();
    await page.getByRole("button", { name: "Simulate my payment (sandbox)" }).click();

    const panel = page.getByTestId("transfer-panel");
    await expect(panel).toContainText("Under review");
    await expect(panel).toContainText("Meridian checks it before Kumasi Machinery Ltd is paid");
  });
});
