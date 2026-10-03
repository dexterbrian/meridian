import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// The dev server for these tests runs with PARTNER_SIMULATE_FAIL=yellowcard
// (playwright.config.ts), so any payment where Yellow Card is cheapest must fall
// back to the next provider.

/** Clicks until the page reacts: the first load of a dev server can be slow to hydrate. */
async function clickUntil(page: Page, button: string, visible: string) {
  await expect(async () => {
    await page.getByRole("button", { name: button }).click();
    await expect(page.getByText(visible)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
}

const data = () =>
  JSON.parse(readFileSync("e2e/.auth/data.json", "utf8")) as { email: string; requests: string[] };

test.describe("public pages", () => {
  test("the header links to sign in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  });
});

test.describe("paying a KES request in another currency", () => {
  test("a payer abroad pays in USDC through the cheapest provider; the business gets the exact amount", async ({
    page,
  }) => {
    await page.goto(`/pay/${data().requests[0]}`);
    await clickUntil(
      page,
      "Paying from abroad or in another currency?",
      "No provider collects yen or yuan yet",
    );

    await page.getByLabel("Currency and way to pay").selectOption({ label: "USD · USDC / USDT" });
    const quotes = page.getByTestId("route-quote");
    // Minisend and Kotani both turn USDC into M-Pesa shillings. Minisend's fees are lower.
    await expect(quotes.first()).toHaveAttribute("data-provider", "minisend");
    await expect(quotes.first()).toContainText("Cheapest");
    await expect(quotes.nth(1)).toHaveAttribute("data-provider", "kotani");
    await expect(quotes.nth(1)).toContainText("Backup 1");
    await expect(quotes.first()).toContainText("KES 129,000.00 arrives");

    await page.getByLabel("Your name").fill("Hans Müller");
    await page.getByLabel("Email").fill("hans@example.test");
    await page.getByRole("button", { name: /^Pay .* with Minisend$/ }).click();

    const box = page.getByTestId("routed-payin");
    await expect(box).toContainText("USDC");
    await expect(box).toContainText("Carried by Minisend");
    await page.getByRole("button", { name: "Simulate the payment arriving" }).click();
    await expect(page.getByRole("heading", { name: "Paid and settled" })).toBeVisible();
    await expect(page.getByText("KES 129,000.00 reached Kilimo Fresh Exports Ltd")).toBeVisible();
  });

  test("when the only provider for a route is down, the payer is told and nothing is charged", async ({
    page,
  }) => {
    await page.goto(`/pay/${data().requests[1]}`);
    await clickUntil(
      page,
      "Paying from abroad or in another currency?",
      "No provider collects yen or yuan yet",
    );
    await page
      .getByLabel("Currency and way to pay")
      .selectOption({ label: "EUR · International bank transfer" });
    const quotes = page.getByTestId("route-quote");
    await expect(quotes).toHaveCount(1);
    await expect(quotes.first()).toHaveAttribute("data-provider", "yellowcard");

    await page.getByLabel("Your name").fill("Marie Dubois");
    await page.getByLabel("Email").fill("marie@example.test");
    await page.getByRole("button", { name: /with Yellow Card$/ }).click();
    await expect(page.getByText("No provider could take this payment right now")).toBeVisible();
  });
});

test.describe("sending money to suppliers", () => {
  test.use({ storageState: "e2e/.auth/state.json" });

  async function addRecipient(
    page: Page,
    r: { name: string; country: string; account: string; swift?: string; iban?: string },
  ) {
    await expect(async () => {
      await page.getByRole("button", { name: "New" }).click();
      await expect(page.getByTestId("recipient-form")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    const form = page.getByTestId("recipient-form");
    await form.getByLabel("Recipient name").fill(r.name);
    await form.getByLabel("Country").selectOption({ label: r.country });
    await form.getByLabel("Account number").fill(r.account);
    if (r.swift) await form.getByLabel("SWIFT code").fill(r.swift);
    if (r.iban) await form.getByLabel("IBAN").fill(r.iban);
    await form.getByLabel("Address").fill("1 Industrial Road");
    await form.getByRole("button", { name: "Save recipient" }).click();
    await expect(page.getByLabel("Recipient", { exact: true })).toHaveValue(/[0-9a-f-]{36}/);
  }

  test("the business nav links to Send money", async ({ page }) => {
    await page.goto("/app");
    await page.getByRole("link", { name: "Send money" }).first().click();
    await expect(page.getByRole("heading", { name: "Send money" })).toBeVisible();
  });

  test("pays a supplier in China in yuan through Klasha", async ({ page }) => {
    await page.goto("/app/send");
    await addRecipient(page, {
      name: "Shenzhen Tools Co",
      country: "China",
      account: "6222000011112222",
      swift: "ICBKCNBJ",
    });
    await page.getByLabel("Amount the recipient gets").fill("50000");
    await page.getByLabel("Pay from").selectOption("KES|momo");
    await page.getByRole("button", { name: "Compare prices" }).click();

    const quotes = page.getByTestId("route-quote");
    await expect(quotes).toHaveCount(1);
    await expect(quotes.first()).toHaveAttribute("data-provider", "klasha");
    await expect(quotes.first()).toContainText("CN¥50,000.00 arrives");

    await page.getByRole("button", { name: /^Send CN¥50,000\.00 with Klasha$/ }).click();
    const panel = page.getByTestId("transfer-panel");
    await expect(panel).toContainText("Waiting for payment");
    await expect(page.getByTestId("routed-payin")).toContainText("Carried by Klasha");
    await page.getByRole("button", { name: "Simulate my payment (sandbox)" }).click();
    await expect(panel).toContainText(
      "Shenzhen Tools Co has been paid CN¥50,000.00 through Klasha",
    );
  });

  test("pays a supplier in Japan in yen", async ({ page }) => {
    await page.goto("/app/send");
    await addRecipient(page, {
      name: "Yokohama Auto Exports",
      country: "Japan",
      account: "1234567",
      swift: "BOTKJPJT",
    });
    await page.getByLabel("Amount the recipient gets").fill("1500000");
    await page.getByLabel("Pay from").selectOption("KES|bank");
    await page.getByRole("button", { name: "Compare prices" }).click();
    await expect(page.getByTestId("route-quote").first()).toContainText("¥1,500,000 arrives");
  });

  test("falls back to Klasha when Yellow Card, the cheapest for euros, is down", async ({
    page,
  }) => {
    await page.goto("/app/send");
    await addRecipient(page, {
      name: "Brussels Flower Auction",
      country: "Belgium",
      account: "BE71096123456769",
      swift: "GEBABEBB",
      iban: "BE71096123456769",
    });
    await page.getByLabel("Amount the recipient gets").fill("5000");
    await page.getByLabel("Pay from").selectOption("KES|momo");
    await page.getByRole("button", { name: "Compare prices" }).click();

    const quotes = page.getByTestId("route-quote");
    await expect(quotes.first()).toHaveAttribute("data-provider", "yellowcard");
    await expect(quotes.nth(1)).toHaveAttribute("data-provider", "klasha");

    await page.getByRole("button", { name: /with Yellow Card$/ }).click();
    await expect(page.getByTestId("fallback-note")).toContainText("Yellow Card was unavailable");
    await expect(page.getByTestId("routed-payin")).toContainText("Carried by Klasha");
    await page.getByRole("button", { name: "Simulate my payment (sandbox)" }).click();
    await expect(page.getByTestId("transfer-panel")).toContainText(
      "has been paid €5,000.00 through Klasha",
    );
    await expect(page.getByTestId("transfer-list")).toContainText("Brussels Flower Auction");
  });
});
