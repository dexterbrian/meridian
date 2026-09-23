import { A } from "@solidjs/router";
import { Wordmark } from "./wordmark";

export function SiteFooter() {
  return (
    <footer class="border-t border-border/70 px-5 py-12">
      <div class="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div class="max-w-sm space-y-3">
          <Wordmark />
          <p class="text-sm text-muted-foreground">
            African money in motion. Pay suppliers and get paid across borders in minutes.
          </p>
          <p class="text-xs text-muted-foreground">
            A product of Appify Softwares Limited —{" "}
            <a
              href="https://appify.co.ke"
              target="_blank"
              rel="noreferrer"
              class="text-primary hover:underline"
            >
              appify.co.ke
            </a>
          </p>
        </div>
        <div class="grid grid-cols-2 gap-8 text-sm sm:grid-cols-4">
          <div class="space-y-2">
            <p class="font-semibold">Product</p>
            <a href="/#how" class="block text-muted-foreground hover:text-foreground">
              How it works
            </a>
            <a href="/#pricing" class="block text-muted-foreground hover:text-foreground">
              Pricing
            </a>
            <a href="/#faq" class="block text-muted-foreground hover:text-foreground">
              FAQ
            </a>
          </div>
          <div class="space-y-2">
            <p class="font-semibold">Demos</p>
            <A href="/demo/checkout" class="block text-muted-foreground hover:text-foreground">
              Checkout
            </A>
            <A href="/demo/send" class="block text-muted-foreground hover:text-foreground">
              Pay a supplier
            </A>
            <A href="/demo/request" class="block text-muted-foreground hover:text-foreground">
              Payment link
            </A>
          </div>
          <div class="space-y-2">
            <p class="font-semibold">Company</p>
            <a href="/#contact" class="block text-muted-foreground hover:text-foreground">
              Contact
            </a>
            <a href="/#waitlist" class="block text-muted-foreground hover:text-foreground">
              Waitlist
            </a>
          </div>
          <div class="space-y-2">
            <p class="font-semibold">Legal</p>
            <A href="/terms" class="block text-muted-foreground hover:text-foreground">
              Terms of Service
            </A>
            <A href="/privacy" class="block text-muted-foreground hover:text-foreground">
              Privacy Policy
            </A>
          </div>
        </div>
      </div>
      <div class="mx-auto mt-10 max-w-6xl border-t border-border/70 pt-6 text-xs text-muted-foreground">
        Meridian is under development. Everything on this site is a demonstration. No real funds
        move. Meridian is a technology platform. Licensed, regulated partners handle all money
        movement.
      </div>
    </footer>
  );
}
