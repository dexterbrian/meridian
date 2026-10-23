import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { ENABLED_PROVIDERS } from "../src/lib/providers";

// Kotani Pay is the only routed provider switched on (ENABLED_PROVIDERS in
// src/lib/providers.ts), so these tests follow a payment it carries on its own
// and check that nothing a switched-off provider would carry is ever offered.
// The tests for a second provider taking over come back with that provider.

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
  test("a payer abroad pays in USDC through Kotani; the business gets the exact amount", async ({
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
    await expect(quotes).toHaveCount(1);
    await expect(quotes.first()).toHaveAttribute("data-provider", "kotani");
    // One provider, so there is nothing to call cheapest.
    await expect(quotes.first()).not.toContainText("Cheapest");
    await expect(quotes.first()).toContainText("KES 129,000.00 arrives");

    await page.getByLabel("Your name").fill("Hans Müller");
    await page.getByLabel("Email").fill("hans@example.test");
    await page.getByRole("button", { name: /^Pay .* with Kotani Pay$/ }).click();

    const box = page.getByTestId("routed-payin");
    await expect(box).toContainText("USDC");
    await expect(box).toContainText("Carried by Kotani Pay");
    await page.getByRole("button", { name: "Simulate the payment arriving" }).click();
    await expect(page.getByRole("heading", { name: "Paid and settled" })).toBeVisible();
    await expect(page.getByText("KES 129,000.00 reached Kilimo Fresh Exports Ltd")).toBeVisible();
  });

  test("a payer is only offered currencies a switched-on provider can take", async ({ page }) => {
    await page.goto(`/pay/${data().requests[1]}`);
    await clickUntil(
      page,
      "Paying from abroad or in another currency?",
      "No provider collects yen or yuan yet",
    );
    const choices = page.getByLabel("Currency and way to pay");
    // Euros from abroad are Yellow Card's, and it is switched off.
    await expect(choices.getByRole("option", { name: /^EUR/ })).toHaveCount(0);
    // What Kotani collects is there: dollars on-chain, and cedis by mobile money.
    await expect(choices.getByRole("option", { name: "USD · USDC / USDT" })).toHaveCount(1);
    await expect(choices.getByRole("option", { name: /^GHS · Mobile money/ })).toHaveCount(1);
    // The note about yen and yuan names a way to pay that actually works today.
    await expect(page.getByText("Pay in USD instead: usdc / usdt.")).toBeVisible();
  });
});

test.describe("sending money to suppliers", () => {
  test.use({ storageState: "e2e/.auth/state.json" });

  async function addRecipient(
    page: Page,
    r: {
      name: string;
      country: string;
      currency?: string;
      method?: string;
      account: string;
      network?: string;
      swift?: string;
      iban?: string;
      address?: string;
    },
  ) {
    await expect(async () => {
      await page.getByRole("button", { name: "New" }).click();
      await expect(page.getByTestId("recipient-form")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    const form = page.getByTestId("recipient-form");
    await form.getByLabel("Recipient name").fill(r.name);
    await form.getByLabel("Country").selectOption({ label: r.country });
    if (r.currency) await form.getByLabel("Currency").selectOption(r.currency);
    if (r.method) await form.getByLabel("Paid by").selectOption({ label: r.method });
    await form.getByLabel("Account number").fill(r.account);
    if (r.network) await form.getByLabel("Network").fill(r.network);
    if (r.swift) await form.getByLabel("SWIFT code").fill(r.swift);
    if (r.iban) await form.getByLabel("IBAN").fill(r.iban);
    // The address field is only asked for abroad, where wires need it.
    if (r.address) await form.getByLabel("Address").fill(r.address);
    await form.getByRole("button", { name: "Save recipient" }).click();
    await expect(page.getByLabel("Recipient", { exact: true })).toHaveValue(/[0-9a-f-]{36}/);
  }

  test("the business nav links to Send money", async ({ page }) => {
    await page.goto("/app");
    await page.getByRole("link", { name: "Send money" }).first().click();
    await expect(page.getByRole("heading", { name: "Send money" })).toBeVisible();
  });

  test("pays a supplier in Ghana in cedis through Kotani", async ({ page }) => {
    await page.goto("/app/send");
    await addRecipient(page, {
      name: "Accra Packaging Ltd",
      country: "Ghana",
      currency: "GHS",
      method: "Mobile money",
      account: "233244123456",
      network: "MTN",
    });
    await page.getByLabel("Amount the recipient gets").fill("5000");
    await page.getByLabel("Pay from").selectOption("KES|momo");
    await page.getByRole("button", { name: "Compare prices" }).click();

    const quotes = page.getByTestId("route-quote");
    await expect(quotes).toHaveCount(1);
    await expect(quotes.first()).toHaveAttribute("data-provider", "kotani");
    await expect(quotes.first()).toContainText("GH₵5,000.00 arrives");

    await page.getByRole("button", { name: /^Send GH₵5,000\.00 with Kotani Pay$/ }).click();
    const panel = page.getByTestId("transfer-panel");
    await expect(panel).toContainText("Waiting for payment");
    await expect(page.getByTestId("routed-payin")).toContainText("Carried by Kotani Pay");
    await page.getByRole("button", { name: "Simulate my payment (sandbox)" }).click();
    await expect(panel).toContainText("Accra Packaging Ltd has been paid GH₵5,000.00");
    await expect(page.getByTestId("transfer-list")).toContainText("Accra Packaging Ltd");
  });

  test("a business cannot pick a country no switched-on provider pays", async ({ page }) => {
    await page.goto("/app/send");
    await expect(async () => {
      await page.getByRole("button", { name: "New" }).click();
      await expect(page.getByTestId("recipient-form")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    const countries = page.getByTestId("recipient-form").getByLabel("Country");
    // China and Japan are Klasha's, which is switched off.
    await expect(countries.getByRole("option", { name: "China" })).toHaveCount(0);
    await expect(countries.getByRole("option", { name: "Japan" })).toHaveCount(0);
    await expect(countries.getByRole("option", { name: "Ghana" })).toHaveCount(1);
  });

  test("the switched-off providers stay out of the list", async () => {
    expect([...ENABLED_PROVIDERS].sort()).toEqual(["kotani", "payaza"]);
  });
});
