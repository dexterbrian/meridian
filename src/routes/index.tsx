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
      { title: "Meridian — Pay suppliers and get paid, across borders, in minutes" },
      {
        name: "description",
        content:
          "Meridian helps African importers and exporters pay suppliers and collect from customers anywhere, in minutes, for a flat 1% plus partner fees. Join the waitlist.",
      },
      {
        property: "og:title",
        content: "Meridian — Pay suppliers and get paid, across borders, in minutes",
      },
      {
        property: "og:description",
        content:
          "Africa to Africa. Africa to the world. Flat 1% on top of our licensed partner's fee. No FX markup. Under development — join the waitlist.",
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
            Pay your supplier today. <span className="text-flow">Not next week.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Meridian is for African businesses that import and export. Pay a factory in China, a
            packaging supplier in Ghana or a shipper in Dubai. Collect from a buyer in Germany or
            Juba. Money lands in minutes. You see every fee before you confirm.
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
              { k: "Minutes", v: "not 4 to 5 days" },
              { k: "1%", v: "flat Meridian fee" },
              { k: "0%", v: "FX markup from us" },
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
              <p className="text-xs text-muted-foreground">Nairobi, Kenya — you send</p>
              <p className="font-display text-3xl font-semibold">KSh 1,500,000</p>
            </div>
            <div className="meridian-line pl-5 text-sm text-muted-foreground">
              <p>Compliance checks cleared</p>
              <p>Converted by our licensed partner</p>
              <p>Payout sent to supplier's bank</p>
            </div>
            <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
              <p className="text-xs text-muted-foreground">Shenzhen, China — supplier receives</p>
              <p className="font-display text-3xl font-semibold text-primary">¥ 82,400</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Total cost KSh 30,000 (2%). Your bank would take 8 to 10%.
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Illustration. Real fees and the amount received are shown before you confirm.
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
    title: "The factory will not start until your money lands",
    body: "Your bank takes 4 to 5 days to confirm a payment. The supplier's 14-day lead time starts after that. You run out of stock waiting.",
  },
  {
    icon: TrendingDown,
    title: "8 to 10% gone before the goods ship",
    body: "Bank fees, a poor rate on your shilling account, and charges you only see on the statement. Some importers carry cash to a forex agent to get a fair rate.",
  },
  {
    icon: Globe2,
    title: "Your buyer cannot pay you",
    body: "A customer in Juba flies to Nairobi to pay in person. A buyer in Europe waits a week while their bank asks for invoices and shipping papers.",
  },
  {
    icon: Receipt,
    title: "You find out the real cost when the money arrives short",
    body: "The quoted fee is not the whole fee. The rate is not the rate. Nobody shows you the total up front.",
  },
];

function Pain() {
  return (
    <section id="problem" className="border-t border-border/70 px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-2xl font-display text-3xl font-bold sm:text-4xl">
          If you import or export, you know this already
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          We heard these from Kenyan importers of electronics, hardware and cars, and from exporters
          of fresh produce. Meridian is built for them.
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
    title: "Minutes, not days",
    body: "Your supplier sees the money the same day. Production starts. Stock arrives.",
  },
  {
    icon: Banknote,
    title: "Flat 1%. No FX markup.",
    body: "Our licensed partner's fee, plus 1% for Meridian. That is the whole price. We add nothing to the exchange rate.",
  },
  {
    icon: Wallet,
    title: "Your currency, their currency",
    body: "You pay in shillings from M-Pesa or your bank. They receive yuan, dollars, cedis or euros in their own account.",
  },
  {
    icon: Globe2,
    title: "Africa and the world",
    body: "Pay suppliers in China, Japan, Dubai, Europe and across Africa. Collect from buyers anywhere with a link or a checkout on your site.",
  },
];

function Solution() {
  return (
    <section className="border-t border-border/70 px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              One account. Pay out. Get paid.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Meridian sits between your bank or mobile money and the rest of the world. You send.
              We handle conversion, compliance and delivery. Your supplier gets local currency.
            </p>
            <p className="mt-4 text-muted-foreground">
              Meridian does not hold your money. Licensed, regulated partners move it. We build the
              software and check every transaction.
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
    title: "Checkout on your site",
    body: "What your customer sees when they pay you. Bank, mobile money or card. Fees shown first.",
  },
  {
    to: "/demo/send" as const,
    icon: Globe2,
    title: "Pay a supplier abroad",
    body: "Send to another country. Watch the fees, the conversion and the payout, step by step.",
  },
  {
    to: "/demo/request" as const,
    icon: Link2,
    title: "Payment link",
    body: "Create a link, share it, then open it as the payer and settle it.",
  },
];

function Demos() {
  return (
    <section id="demos" className="border-t border-border/70 px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Try it</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Three working demos. They behave like the real product. No money moves. No account
              needed.
            </p>
          </div>
          <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            Demo environment
          </span>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {DEMOS.map((d) => (
            <Link
              key={d.to}
              to={d.to}
              className="panel group p-6 transition-colors hover:bg-surface"
            >
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
            Partner fee, plus 1%. That is all.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Our licensed partner charges a fee to collect and pay out. We show you that fee, add a
            flat 1%, and that is the whole price. No monthly fee. No markup on the exchange rate.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              "Bank transfer: about 1% partner fee",
              "Mobile money: about 2% partner fee",
              "Card: about 2.5% partner fee",
              "Exchange rate: set by our partner, shown before you confirm",
              "Meridian: flat 1%",
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-muted-foreground">
            Partner fees are estimates until launch. They vary by country and method.
          </p>
        </div>

        <div className="panel p-6">
          <p className="text-sm font-semibold">What will it cost?</p>
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
            Compared with a typical bank route, you keep about{" "}
            <span className="font-semibold text-success">
              {formatMoney(Math.max(quote.saving, 0), from)}
            </span>
            .
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
    title: "Register your business",
    body: "Upload your registration certificate and a director's ID. Start with small payments the same day. Upload the rest to raise your limits.",
  },
  {
    n: "02",
    title: "Pay a supplier",
    body: "Add the supplier once. Enter the amount. See the fees and what they will receive. Pay from M-Pesa or your bank. Done.",
  },
  {
    n: "03",
    title: "Get paid",
    body: "Send a payment link or put our checkout on your website. Your customer pays by bank, mobile money or card. You get local currency in your account.",
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
            Tell us where you send money. We build that route first.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Meridian is in development. The waitlist decides which countries and payment methods we
            launch with.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
            {[
              "Founding pricing locked for 12 months",
              "Early access on your route before public launch",
              "A direct line to the team",
              "One email when we go live. Nothing else.",
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
                <Field name="country" label="Country" placeholder="Kenya" />
              </div>
              <SelectField
                name="monthly_volume"
                label="Monthly cross-border volume"
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
                  Who do you pay, or who pays you, across borders?
                </label>
                <textarea
                  id="pain_point"
                  name="pain_point"
                  rows={3}
                  placeholder="e.g. We pay a hardware factory in China every month. Equity takes 5 days."
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
                We only email you about Meridian. No marketing lists.
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
            Ask about a country we do not list yet, our partners, or compliance. A person replies.
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
    q: "Can I use Meridian today?",
    a: "Not yet. We are building it. The demos on this site show how it will work. Join the waitlist and we will email you when early access opens.",
  },
  {
    q: "Which countries can I pay?",
    a: "At launch: China, Japan, UAE, the UK, the US and the eurozone, plus Kenya, Nigeria, Ghana, South Africa, Uganda and Tanzania. Waitlist answers decide the order. Ask us about a country not listed.",
  },
  {
    q: "Where can my customers pay from?",
    a: "From Africa by mobile money, bank or card. From Europe by card or bank. More regions as partners add coverage.",
  },
  {
    q: "What does it cost?",
    a: "Our licensed partner charges a fee to collect and pay out. Roughly 1% for bank, 2% for mobile money, 2.5% for card. Meridian adds a flat 1%. We do not add anything to the exchange rate. You see every line and the exact amount your recipient gets before you confirm.",
  },
  {
    q: "How fast is it?",
    a: "Most payments land in minutes. Bank wires to some countries can take up to a day. The exact timing shows before you confirm.",
  },
  {
    q: "Does Meridian hold my money?",
    a: "No. Licensed, regulated payment partners collect, convert and pay out. Meridian is the software and the compliance layer. We will name our partners on request through the contact form.",
  },
  {
    q: "How does it move so fast?",
    a: "Our partners settle over digital dollar rails instead of chains of correspondent banks. You never see or touch any of that. You pay in shillings. Your supplier gets yuan, euros or dollars.",
  },
  {
    q: "What do I need to sign up?",
    a: "Your business registration certificate and a director's ID to start with small payments. Add your tax certificate, proof of address and ownership details to raise your limits. Anti-money-laundering law requires this in every country we serve.",
  },
  {
    q: "How big can my payments be?",
    a: "Start at up to USD 500 per payment with basic documents. Up to USD 10,000 per payment once we review your full documents. Higher limits on request for established exporters and importers.",
  },
  {
    q: "Who builds Meridian?",
    a: "Appify Softwares Limited, Nairobi (appify.co.ke).",
  },
  {
    q: "Are the demos real?",
    a: "No. Nothing moves. No account is created. Demo emails are marked as demos.",
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

function SelectField({ name, label, options }: { name: string; label: string; options: string[] }) {
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
