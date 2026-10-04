import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Provider webhooks and transfer checks. The test server knows the Minisend
// webhook secret (playwright.config.ts), so these tests can sign a webhook the
// way Minisend does.

const SECRET = "e2e-minisend-secret";
const data = () =>
  JSON.parse(readFileSync("e2e/.auth/data.json", "utf8")) as { requests: string[] };

function signed(body: object) {
  const raw = JSON.stringify(body);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", SECRET).update(`${t}.${raw}`).digest("hex");
  return {
    raw,
    headers: { "content-type": "application/json", "x-minisend-signature-v2": `t=${t},v1=${v1}` },
  };
}

async function clickUntil(page: Page, button: string, visible: string) {
  await expect(async () => {
    await page.getByRole("button", { name: button }).click();
    await expect(page.getByText(visible)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
}

test.describe("provider webhooks", () => {
  test("a signed Minisend webhook settles a USDC payment; a forged one is refused", async ({
    page,
  }) => {
    await page.goto(`/pay/${data().requests[2]}`);
    await clickUntil(
      page,
      "Paying from abroad or in another currency?",
      "No provider collects yen or yuan yet",
    );
    await page.getByLabel("Currency and way to pay").selectOption({ label: "USD · USDC / USDT" });
    await expect(page.getByTestId("route-quote").first()).toHaveAttribute(
      "data-provider",
      "minisend",
    );
    await page.getByLabel("Your name").fill("Aiko Tanaka");
    await page.getByLabel("Email").fill("aiko@example.test");
    await page.getByRole("button", { name: /with Minisend$/ }).click();
    await expect(page.getByTestId("routed-payin")).toContainText("Carried by Minisend");

    const attempt = new URL(page.url()).searchParams.get("attempt");
    expect(attempt).toBeTruthy();
    const reference = (await page
      .getByText(/^MRD-[A-Z2-9]{8}-\w+$/)
      .first()
      .textContent())!.trim();

    const body = {
      event: "offramp.completed",
      order_id: `order-${Date.now()}`,
      external_reference: reference,
      status: "completed",
      amount_usdc: 1015.18,
      payout_currency: "KES",
    };

    // Wrong secret: refused, nothing moves.
    const forged = await page.request.post("/api/webhooks/minisend", {
      data: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        "x-minisend-signature": createHmac("sha256", "not-the-secret")
          .update(JSON.stringify(body))
          .digest("hex"),
      },
    });
    expect(forged.status()).toBe(401);

    const { raw, headers } = signed(body);
    const ok = await page.request.post("/api/webhooks/minisend", { data: raw, headers });
    expect(ok.status()).toBe(200);
    // The same event again changes nothing.
    const again = await page.request.post("/api/webhooks/minisend", { data: raw, headers });
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
    await form.getByLabel("Recipient name").fill("Guangzhou Machinery Ltd");
    await form.getByLabel("Country").selectOption({ label: "China" });
    await form.getByLabel("Account number").fill("6222000099998888");
    await form.getByLabel("SWIFT code").fill("ICBKCNBJ");
    await form.getByLabel("Address").fill("8 Harbour Road");
    await form.getByRole("button", { name: "Save recipient" }).click();
    await expect(page.getByLabel("Recipient", { exact: true })).toHaveValue(/[0-9a-f-]{36}/);

    // CN¥100,000 is about USD 13,900: over the USD 10,000 line, to a recipient never paid before.
    await page.getByLabel("Amount the recipient gets").fill("100000");
    await page.getByLabel("Pay from").selectOption("KES|momo");
    await page.getByRole("button", { name: "Compare prices" }).click();
    await page.getByRole("button", { name: /with Klasha$/ }).click();
    await page.getByRole("button", { name: "Simulate my payment (sandbox)" }).click();

    const panel = page.getByTestId("transfer-panel");
    await expect(panel).toContainText("Under review");
    await expect(panel).toContainText("Meridian checks it before Guangzhou Machinery Ltd is paid");
  });
});
