import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";

export function DemoBanner({ children }: { children?: ReactNode }) {
  return (
    <div className="border-b border-accent/30 bg-accent/10 px-4 py-2.5 text-center text-xs font-medium text-accent sm:text-sm">
      {children ?? (
        <>
          Demo only — nothing here moves real money. Meridian is currently under development.
        </>
      )}
    </div>
  );
}

export function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-flow">
        <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/80" />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight">Meridian</span>
    </Link>
  );
}

const NAV = [
  { label: "Why Meridian", href: "/#problem" },
  { label: "How it works", href: "/#how" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Demos", href: "/#demos" },
  { label: "FAQ", href: "/#faq" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Wordmark />
        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <a
            href="/#waitlist"
            className="hidden rounded-full bg-flow px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 sm:inline-flex"
          >
            Join the waitlist
          </a>
          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-border p-2 md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="flex flex-col gap-1 border-t border-border px-5 py-3 md:hidden">
          {[...NAV, { label: "Join the waitlist", href: "/#waitlist" }].map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 px-5 py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm space-y-3">
          <Wordmark />
          <p className="text-sm text-muted-foreground">
            African money in motion. Meridian clears the channels so capital flows to where it is
            needed.
          </p>
          <p className="text-xs text-muted-foreground">
            A product of Appify Softwares Limited —{" "}
            <a
              href="https://appify.co.ke"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              appify.co.ke
            </a>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-4">
          <div className="space-y-2">
            <p className="font-semibold">Product</p>
            <a href="/#how" className="block text-muted-foreground hover:text-foreground">
              How it works
            </a>
            <a href="/#pricing" className="block text-muted-foreground hover:text-foreground">
              Pricing
            </a>
            <a href="/#faq" className="block text-muted-foreground hover:text-foreground">
              FAQ
            </a>
          </div>
          <div className="space-y-2">
            <p className="font-semibold">Demos</p>
            <Link to="/demo/checkout" className="block text-muted-foreground hover:text-foreground">
              Checkout
            </Link>
            <Link to="/demo/send" className="block text-muted-foreground hover:text-foreground">
              Cross-border send
            </Link>
            <Link to="/demo/request" className="block text-muted-foreground hover:text-foreground">
              Payment request link
            </Link>
          </div>
          <div className="space-y-2">
            <p className="font-semibold">Company</p>
            <a href="/#contact" className="block text-muted-foreground hover:text-foreground">
              Contact
            </a>
            <a href="/#waitlist" className="block text-muted-foreground hover:text-foreground">
              Waitlist
            </a>
          </div>
          <div className="space-y-2">
            <p className="font-semibold">Legal</p>
            <Link to="/terms" className="block text-muted-foreground hover:text-foreground">
              Terms of Service
            </Link>
            <Link to="/privacy" className="block text-muted-foreground hover:text-foreground">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-6xl border-t border-border/70 pt-6 text-xs text-muted-foreground">
        Meridian is under active development. Everything on this site is a demonstration — no real
        funds are held, moved or settled. Meridian is a technology platform; regulated, licensed
        financial infrastructure partners handle all money movement.
      </div>
    </footer>
  );
}
