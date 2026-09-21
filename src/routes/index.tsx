import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Banknote,
  Clock,
  Globe2,
  Link2,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Wallet,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FeeBreakdown } from "@/components/fee-breakdown";
import { DemoBanner, SiteFooter, SiteHeader } from "@/components/site-chrome";
import { supabase } from "@/integrations/supabase/client";
import { sendNotification } from "@/lib/notify.functions";
import { CURRENCIES, formatMoney, quoteCrossBorder, type Currency } from "@/lib/fees";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Meridian — Payments that flow like they should" },
      {
        name: "description",
        content:
          "Meridian lets African businesses send and receive money locally and across borders in minutes, saving up to 80% on transfer fees. Join the waitlist.",
      },
      { property: "og:title", content: "Meridian — Payments that flow like they should" },
      {
        property: "og:description",
        content:
          "Cross-border payments across Africa in minutes, not days. Transparent pricing, local currency in and out. Under development — join the waitlist.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <SiteHeader />
      <main>
        <Hero />
        <Pain />
        <Solution />
        <Demos />
        <Pricing />
        <HowItWorks />
        <Waitlist />
        <Contact />
        <Faq />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ---------------------------------- hero --------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pb-20 pt-16 sm:pt-24">
      <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            <Sparkles className="h-3.5 w-3.5" /> In development — waitlist open
          </span>
          <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] sm:text-6xl">
            Your money is sitting <span className="text-flow">in transit</span> while your business
            waits.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Three days for a supplier payment to clear. 8–12% gone in fees and spread. A customer in
            Nairobi who cannot pay your Lagos invoice without a bank visit. Meridian moves money
            across African markets in minutes, in the currencies you already use, at a fraction of
            today's cost.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#waitlist"
              className="inline-flex items-center gap-2 rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Join the waitlist <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#demos"
              className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-secondary"
            >
              See the live demos
            </a>
          </div>
          <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6">
            {[
              { k: "Minutes", v: "not days to settle" },
              { k: "Up to 80%", v: "lower transfer cost" },
              { k: "1%", v: "flat Meridian fee" },
            ].map((s) => (
              <div key={s.k}>
                <dt className="font-display text-2xl font-semibold text-primary">{s.k}</dt>
                <dd className="text-xs text-muted-foreground">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="panel glow p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Sample transfer
            </p>
            <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
              Settled in 2m 14s
            </span>
          </div>
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-border bg-surface/60 p-4">
              <p className="text-xs text-muted-foreground">Lagos, Nigeria — you send</p>
              <p className="font-display text-3xl font-semibold">₦4,500,000</p>
            </div>
            <div className="meridian-line pl-5 text-sm text-muted-foreground">
              <p>Compliance checks cleared</p>
              <p>Currency converted at mid-market + 0.35%</p>
              <p>Payout instructed to recipient bank</p>
            </div>
            <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
              <p className="text-xs text-muted-foreground">Nairobi, Kenya — supplier receives</p>
              <p className="font-display text-3xl font-semibold text-primary">KSh 372,300</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Total cost ₦105,750 (2.35%) — a bank would have charged about ₦405,000
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Illustration using indicative demo pricing.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- pain --------------------------------- */

const PAINS = [
  {
    icon: Clock,
    title: "Your cash is stuck in limbo",
    body: "A supplier payment sent Friday lands Wednesday. Production stops, containers sit at the port, and you pay demurrage on money you already sent.",
  },
  {
    icon: TrendingDown,
    title: "Fees eat the margin you fought for",
    body: "8–12% disappears between correspondent banks, FX spread and 'processing'. On $50,000 a month that is a salary you are paying to move your own money.",
  },
  {
    icon: Globe2,
    title: "Your customers cannot pay you easily",
    body: "A buyer in Accra wants to pay your Kampala invoice. Between them sits a bank branch, a form, a swift code and a week of follow-up. Some of them simply do not pay.",
  },
  {
    icon: Receipt,
    title: "You cannot see what anything costs",
    body: "The quoted fee is not the real fee. The rate is not the mid-market rate. You only learn the true cost when the money lands short.",
  },
];

function Pain() {
  return (
    <section id="problem" className="border-t border-border/70 px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-2xl font-display text-3xl font-bold sm:text-4xl">
          If you trade across African borders, you already know this pain
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Meridian is not a nice-to-have dashboard. It is built for businesses whose growth is
          capped by how slowly and expensively their money moves.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {PAINS.map((p) => (
            <div key={p.title} className="panel p-6">
              <p.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- solution -------------------------------- */

const BENEFITS = [
  {
    icon: Clock,
    title: "Speed",
    body: "Payments settle in minutes, not days. Your cash is never stuck in limbo.",
  },
  {
    icon: Banknote,
    title: "Cost",
    body: "Save up to 80% on transaction fees compared with traditional cross-border transfers.",
  },
  {
    icon: Wallet,
    title: "Simplicity",
    body: "Send and receive in your local currency. You see naira, cedis, shillings or dollars — nothing else.",
  },
  {
    icon: Globe2,
    title: "Reach",
    body: "Pay suppliers, collect from customers and move money across African markets and beyond, from one app.",
  },
];

function Solution() {
  return (
    <section className="border-t border-border/70 px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              You tap send. The money arrives. That's it.
            </h2>
            <p className="mt-4 text-muted-foreground">
              In acupuncture, a meridian is a channel through which vital energy flows freely. When
              meridians are blocked, the body suffers. Money is the vital energy of a business —
              Meridian clears the channels so capital reaches where it is needed.
            </p>
            <p className="mt-4 text-muted-foreground">
              It works like the mobile money you already know, only faster, cheaper and borderless.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <div key={b.title} className="panel p-6">
                <b.icon className="h-5 w-5 text-accent" />
                <h3 className="mt-3 font-semibold">{b.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- demos --------------------------------- */

const DEMOS = [
  {
    to: "/demo/checkout" as const,
    icon: Receipt,
    title: "Customer checkout",
    body: "See what your African customers experience when they pay you — bank transfer, mobile money or card, with the cost shown up front.",
  },
  {
    to: "/demo/send" as const,
    icon: Globe2,
    title: "Cross-border send",
    body: "Pay a supplier in another African market and watch the conversion, fees and settlement timeline in real time.",
  },
  {
    to: "/demo/request" as const,
    icon: Link2,
    title: "Payment request link",
    body: "Create a shareable payment link, then open it as the payer and settle the invoice — the full request-to-paid loop.",
  },
];

function Demos() {
  return (
    <section id="demos" className="border-t border-border/70 px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Try the product now</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              These are working demonstrations of how Meridian will behave. They look and feel like
              the real thing, but no money moves and no account is required.
            </p>
          </div>
          <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            Demo environment
          </span>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {DEMOS.map((d) => (
            <Link key={d.to} to={d.to} className="panel group p-6 transition-colors hover:bg-surface">
              <d.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{d.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{d.body}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                Open demo{" "}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- pricing -------------------------------- */

function Pricing() {
  const [amount, setAmount] = useState(2500000);
  const [from, setFrom] = useState<Currency>("NGN");
  const [to, setTo] = useState<Currency>("KES");
  const quote = quoteCrossBorder(amount || 0, from, to, "bank");

  return (
    <section id="pricing" className="border-t border-border/70 px-5 py-20">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-start">
        <div>
          <h2 className="font-display text-3xl font-bold sm:text-4xl">
            One flat 1%. On top of cost. Nothing hidden.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Our licensed infrastructure partners charge a fee to collect and pay out in local
            currency. We show you that fee, add a flat 1%, and that is the whole price. No monthly
            minimums, no markup buried in the exchange rate.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              "Bank transfer collection and payout: 1.0% partner fee",
              "Mobile money collection and payout: 2.0% partner fee",
              "Card collection: 2.5% partner fee",
              "Currency conversion: mid-market rate + 0.35%",
              "Meridian: flat 1%",
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-muted-foreground">
            Indicative pricing while we finish the build. Final published rates may vary by market
            and payment method.
          </p>
        </div>

        <div className="panel p-6">
          <p className="text-sm font-semibold">What will it cost me?</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="sm:col-span-1 block text-xs text-muted-foreground">
              You send
              <select
                value={from}
                onChange={(e) => setFrom(e.target.value as Currency)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2 block text-xs text-muted-foreground">
              Amount
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="sm:col-span-3 block text-xs text-muted-foreground">
              They receive in
              <select
                value={to}
                onChange={(e) => setTo(e.target.value as Currency)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-5">
            <FeeBreakdown quote={quote} currencyCode={from} receiveCurrency={to} />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            On this transfer you keep{" "}
            <span className="font-semibold text-success">
              {formatMoney(Math.max(quote.saving, 0), from)}
            </span>{" "}
            that a traditional route would have taken.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- how it works ------------------------------ */

const STEPS = [
  {
    n: "01",
    title: "Sign up with your business details",
    body: "A short business verification (KYB), like opening any mobile money account. It keeps you and the network compliant with anti-money-laundering rules.",
  },
  {
    n: "02",
    title: "Fund your account in local currency",
    body: "Bank transfer or mobile money. Your balance shows in naira, cedis, shillings or dollars — the currency you actually think in.",
  },
  {
    n: "03",
    title: "Send or request payment",
    body: "Pay anyone, anywhere. Recipients get local currency in their bank or mobile money account. Meridian handles conversion, compliance and settlement invisibly.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="border-t border-border/70 px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">How it works</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="panel p-6">
              <span className="font-mono text-sm text-accent">{s.n}</span>
              <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- waitlist -------------------------------- */

function Waitlist() {
  const notify = useServerFn(sendNotification);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      business_name: String(form.get("business_name") || ""),
      contact_name: String(form.get("contact_name") || ""),
      email: String(form.get("email") || ""),
      country: String(form.get("country") || ""),
      monthly_volume: String(form.get("monthly_volume") || ""),
      pain_point: String(form.get("pain_point") || ""),
    };
    setBusy(true);
    const { error } = await supabase.from("waitlist_signups").insert(payload);
    if (error) {
      setBusy(false);
      toast.error("We couldn't save that. Please try again.");
      return;
    }
    await notify({
      data: {
        to: payload.email,
        subject: "You're on the Meridian waitlist",
        heading: `Welcome aboard, ${payload.contact_name.split(" ")[0] || "there"}`,
        intro:
          "Thanks for joining the Meridian waitlist. You'll be among the first businesses invited when we open early access, and we'll email you the moment the app is ready.",
        rows: [
          { label: "Business", value: payload.business_name },
          { label: "Country", value: payload.country || "—" },
          { label: "Monthly volume", value: payload.monthly_volume || "—" },
        ],
        footnote:
          "Every waitlist signup helps us prioritise the corridors and payment methods we build first. Reply to this email any time to tell us more about your payment flows.",
      },
    }).catch(() => undefined);
    setBusy(false);
    setDone(true);
    toast.success("You're on the list — check your inbox.");
  }

  return (
    <section id="waitlist" className="border-t border-border/70 px-5 py-20">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h2 className="font-display text-3xl font-bold sm:text-4xl">
            Meridian is being built right now — help decide what ships first
          </h2>
          <p className="mt-4 text-muted-foreground">
            We are in active development. The waitlist is not a mailing list: it is how we choose
            which corridors, currencies and payout methods to launch with. Tell us where your money
            is stuck and we will build that lane first.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
            {[
              "Founding-user pricing locked for your first 12 months",
              "Early access before public launch, in your corridor",
              "Direct line to the team building it — your pain points shape the roadmap",
              "An email the day the app goes live. No spam in between.",
            ].map((b) => (
              <li key={b} className="flex gap-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                {b}
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-6">
          {done ? (
            <div className="py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                <ShieldCheck className="h-6 w-6 text-success" />
              </div>
              <h3 className="mt-4 text-xl font-semibold">You're on the list</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                A confirmation is on its way. We'll notify you the moment Meridian is ready.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <h3 className="text-lg font-semibold">Join the waitlist</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="business_name" label="Business name" required />
                <Field name="contact_name" label="Your name" required />
                <Field name="email" label="Work email" type="email" required />
                <Field name="country" label="Country of operation" placeholder="Kenya" />
              </div>
              <SelectField
                name="monthly_volume"
                label="Monthly payment volume"
                options={[
                  "Under $10,000",
                  "$10,000 – $50,000",
                  "$50,000 – $250,000",
                  "$250,000 – $1M",
                  "Over $1M",
                ]}
              />
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="pain_point">
                  Where does your money get stuck today?
                </label>
                <textarea
                  id="pain_point"
                  name="pain_point"
                  rows={3}
                  placeholder="e.g. Paying our fabric supplier in Ghana takes 4 days and costs us 9%."
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Adding you…" : "Get early access"}
              </button>
              <p className="text-xs text-muted-foreground">
                We only email you about Meridian's development and launch.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- contact -------------------------------- */

function Contact() {
  const notify = useServerFn(sendNotification);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      company: String(form.get("company") || ""),
      subject: String(form.get("subject") || ""),
      message: String(form.get("message") || ""),
    };
    setBusy(true);
    const { error } = await supabase.from("contact_messages").insert(payload);
    if (error) {
      setBusy(false);
      toast.error("Message not sent. Please try again.");
      return;
    }
    await notify({
      data: {
        to: payload.email,
        subject: "We received your message — Meridian",
        heading: "Thanks for reaching out",
        intro:
          "We've received your message and a member of the Meridian team at Appify Softwares will reply shortly. Here's a copy for your records.",
        rows: [
          { label: "Subject", value: payload.subject || "General enquiry" },
          { label: "Company", value: payload.company || "—" },
          { label: "Message", value: payload.message.slice(0, 180) },
        ],
      },
    }).catch(() => undefined);
    setBusy(false);
    setDone(true);
    toast.success("Message sent — confirmation emailed.");
  }

  return (
    <section id="contact" className="border-t border-border/70 px-5 py-20">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Talk to us</h2>
          <p className="mt-4 text-muted-foreground">
            Partnership, compliance, corridor coverage or a question about who our licensed
            infrastructure partners are — ask and we'll answer. Every message gets an automatic
            confirmation and a human reply.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Meridian is built by Appify Softwares Limited,{" "}
            <a
              href="https://appify.co.ke"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              appify.co.ke
            </a>
            .
          </p>
        </div>
        <div className="panel p-6">
          {done ? (
            <div className="py-10 text-center">
              <h3 className="text-xl font-semibold">Message received</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                We've emailed you a confirmation and will be in touch soon.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="name" label="Your name" required />
                <Field name="email" label="Email" type="email" required />
                <Field name="company" label="Company" />
                <Field name="subject" label="Subject" placeholder="Partnership" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="message">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  required
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full border border-primary/60 bg-primary/10 px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
              >
                {busy ? "Sending…" : "Send message"}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- faq ---------------------------------- */

const FAQS = [
  {
    q: "Is Meridian available today?",
    a: "Not yet. Meridian is under active development. What you can use on this site are working demonstrations of the product. Join the waitlist and we will email you the day early access opens.",
  },
  {
    q: "How does the money actually move so fast?",
    a: "Under the hood Meridian settles using stablecoins — digital dollars that move over the internet in seconds — instead of chains of correspondent banks. You never touch them: you see naira, cedis, shillings or dollars, and recipients receive local currency in their bank or mobile money account. No wallets, no crypto jargon, no blockchain knowledge required, ever.",
  },
  {
    q: "Do I need to know anything about crypto?",
    a: "No. Stablecoins are an internal settlement rail, the same way card networks or SWIFT are today. You fund in your local currency, send in your local currency and your recipient is paid in theirs.",
  },
  {
    q: "Does Meridian hold my money?",
    a: "No. Meridian is strictly a technology platform. We do not hold, control or handle client funds. All funds are held and moved by our licensed and compliant financial infrastructure partners, who are regulated in the markets where they operate.",
  },
  {
    q: "Who are your infrastructure partners?",
    a: "We work with licensed and compliant financial infrastructure providers for collections, currency conversion and payouts across African markets. We are happy to share the specific partners on request — send us a note through the contact form above.",
  },
  {
    q: "What does it cost?",
    a: "Our partners charge a fee to collect and pay out in local currency (typically 1% for bank transfer, 2% for mobile money, 2.5% for cards) plus a 0.35% conversion spread where currencies differ. Meridian adds a flat 1% on top of that — and shows you every line before you confirm.",
  },
  {
    q: "Why do I have to verify my business?",
    a: "Business verification (KYB) is required for anti-money-laundering compliance in every market we serve. It is a one-time onboarding step, similar to opening a mobile money or business bank account, and it protects everyone on the network.",
  },
  {
    q: "Which countries and currencies will you support?",
    a: "We are launching across major African corridors — Nigeria, Kenya, Ghana, South Africa, Uganda and Tanzania to start — with US dollar support for international counterparties. Waitlist responses decide the order we build in.",
  },
  {
    q: "How long do payments take?",
    a: "Most payments settle in minutes. Timing at the very edges depends on the recipient's bank or mobile money operator, and on compliance checks for larger amounts.",
  },
  {
    q: "Who builds and owns Meridian?",
    a: "Meridian is a product of Appify Softwares Limited (appify.co.ke). Meridian is strictly a technology platform provider; our licensed financial infrastructure partners handle all money movement and custody.",
  },
  {
    q: "Are the demos on this site real transactions?",
    a: "No. Every demo — checkout, cross-border send and payment request links — is a simulation for illustration. No funds move, no account is created and the confirmation emails are clearly marked as demo messages.",
  },
];

function Faq() {
  return (
    <section id="faq" className="border-t border-border/70 px-5 py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">Frequently asked questions</h2>
        <Accordion type="single" collapsible className="mt-8">
          {FAQS.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

/* -------------------------------- form bits ------------------------------- */

function Field({
  name,
  label,
  type = "text",
  required,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}

function SelectField({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: string[];
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground" htmlFor={name}>
        {label}
      </label>
      <select
        id={name}
        name={name}
        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
