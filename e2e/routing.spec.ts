import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { ENABLED_PROVIDERS } from "../src/lib/providers";

// Kotani Pay is the only routed provider switched on (ENABLED_PROVIDERS in
// src/lib/providers.ts), so these tests follow a payment it carries on its own.
// Money goes in as ordinary currency and comes out as ordinary currency: there
// is no crypto anywhere in the product, whoever is switched on.

/** Waits for the pay page to be ready: the first load of a dev server can be slow. */
async function payPageReady(page: Page) {
  await expect(page.getByLabel("Currency and way to pay")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("No provider collects yen or yuan yet")).toBeVisible();
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
  test("a buyer in Ghana pays cedis by mobile money; the business gets the exact shillings", async ({
    page,
  }) => {
    await page.goto(`/pay/${data().requests[0]}`);
    await payPageReady(page);

    await page
      .getByLabel("Currency and way to pay")
      .selectOption({ label: "GHS · Mobile money (Ghana)" });
    const quotes = page.getByTestId("route-quote");
    await expect(quotes).toHaveCount(1);
    await expect(quotes.first()).toHaveAttribute("data-provider", "kotani");
    // One provider, so there is nothing to call cheapest.
    await expect(quotes.first()).not.toContainText("Cheapest");
    await expect(quotes.first()).toContainText("KES 129,000.00 arrives");

    await page.getByLabel("Your name").fill("Kwame Mensah");
    await page.getByLabel("Email").fill("kwame@example.test");
    await page.getByLabel("Your country").selectOption("GH");
    await page.getByLabel("Phone").fill("233244123456");
    await page.getByRole("button", { name: /^Pay .* with Kotani Pay$/ }).click();

    const box = page.getByTestId("routed-payin");
    await expect(box).toContainText("Approve the prompt on your phone");
    await expect(box).toContainText("Carried by Kotani Pay");
    await page.getByRole("button", { name: "Simulate the payment arriving" }).click();
    await expect(page.getByRole("heading", { name: "Paid and settled" })).toBeVisible();
    await expect(page.getByText("KES 129,000.00 reached Kilimo Fresh Exports Ltd")).toBeVisible();
  });

  test("a payer is only offered real currencies a switched-on provider can take", async ({
    page,
  }) => {
    await page.goto(`/pay/${data().requests[1]}`);
    await payPageReady(page);
    const choices = page.getByLabel("Currency and way to pay");
    // No crypto is offered to anyone, ever.
    await expect(choices).not.toContainText("USDC");
    await expect(choices).not.toContainText("USDT");
    // Euros from abroad are Yellow Card's, and it is switched off.
    await expect(choices.getByRole("option", { name: /^EUR/ })).toHaveCount(0);
    // What Kotani collects is there: African local currencies by mobile money,
    // and only that. Its bank and card deposits need a checkout page we haven't built.
    await expect(choices.getByRole("option", { name: /^GHS · Mobile money/ })).toHaveCount(1);
    await expect(choices.getByRole("option", { name: /^ZAR · Mobile money/ })).toHaveCount(1);
    await expect(choices.getByRole("option", { name: /Bank account|Card/ })).toHaveCount(0);
    // With no dollar route open, the note says so instead of naming one.
    await expect(page.getByText("Ask the business for another way to pay.")).toBeVisible();
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

  test("a business is only offered real ways to fund a transfer", async ({ page }) => {
    await page.goto("/app/send");
    const from = page.getByLabel("Pay from");
    await expect(from).not.toContainText("USDC");
    await expect(from.getByRole("option", { name: /KES · Mobile money/ })).toHaveCount(1);
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

  test("Kotani Pay is the only provider money can go through", async () => {
    expect([...ENABLED_PROVIDERS]).toEqual(["kotani"]);
  });
});
