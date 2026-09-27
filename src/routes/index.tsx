import { Meta, Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import ArrowRight from "lucide-solid/icons/arrow-right";
import Banknote from "lucide-solid/icons/banknote";
import Clock from "lucide-solid/icons/clock";
import Globe2 from "lucide-solid/icons/globe-2";
import Link2 from "lucide-solid/icons/link-2";
import Receipt from "lucide-solid/icons/receipt";
import ShieldCheck from "lucide-solid/icons/shield-check";
import Sparkles from "lucide-solid/icons/sparkles";
import TrendingDown from "lucide-solid/icons/trending-down";
import Wallet from "lucide-solid/icons/wallet";
import { For, Show, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";

import { FeeBreakdown } from "~/components/fee-breakdown";
import { DemoBanner } from "~/components/site/banner";
import { SiteFooter } from "~/components/site/footer";
import { SiteHeader } from "~/components/site/header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { toast } from "~/components/ui/toast";
import { CURRENCIES, formatMoney, quoteCrossBorder, type Currency } from "~/lib/fees";
import { joinWaitlist, sendContactMessage } from "~/server/public-actions";

export default function Landing() {
  return (
    <div class="min-h-screen">
      <Title>Meridian — Pay suppliers and get paid, across borders, in minutes</Title>
      <Meta
        name="description"
        content="Meridian helps African importers and exporters pay suppliers and collect from customers anywhere, in minutes, for a flat 1% plus partner fees. Join the waitlist."
      />
      <Meta
        property="og:title"
        content="Meridian — Pay suppliers and get paid, across borders, in minutes"
      />
      <Meta
        property="og:description"
        content="Africa to Africa. Africa to the world. Flat 1% on top of our licensed partner's fee. No FX markup. Under development — join the waitlist."
      />
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
    <section class="relative overflow-hidden px-5 pb-20 pt-16 sm:pt-24">
      <div class="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <span class="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            <Sparkles class="h-3.5 w-3.5" /> In development — waitlist open
          </span>
          <h1 class="mt-6 font-display text-4xl font-bold leading-[1.05] sm:text-6xl">
            Pay your supplier today. <span class="text-flow">Not next week.</span>
          </h1>
          <p class="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Meridian is for African businesses that import and export. Pay a factory in China, a
            packaging supplier in Ghana or a shipper in Dubai. Collect from a buyer in Germany or
            Juba. Money lands in minutes. You see every fee before you confirm.
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <a
              href="#waitlist"
              class="inline-flex items-center gap-2 rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Join the waitlist <ArrowRight class="h-4 w-4" />
            </a>
            <a
              href="#demos"
              class="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-secondary"
            >
              See the live demos
            </a>
          </div>
          <dl class="mt-12 grid max-w-lg grid-cols-3 gap-6">
            <For
              each={[
                { k: "Minutes", v: "not 4 to 5 days" },
                { k: "1%", v: "flat Meridian fee" },
                { k: "0%", v: "FX markup from us" },
              ]}
            >
              {(s) => (
                <div>
                  <dt class="font-display text-2xl font-semibold text-primary">{s.k}</dt>
                  <dd class="text-xs text-muted-foreground">{s.v}</dd>
                </div>
              )}
            </For>
          </dl>
        </div>
        <div class="panel glow p-6">
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Sample transfer
            </p>
            <span class="rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
              Settled in 2m 14s
            </span>
          </div>
          <div class="mt-6 space-y-4">
            <div class="rounded-xl border border-border bg-surface/60 p-4">
              <p class="text-xs text-muted-foreground">Nairobi, Kenya — you pay</p>
              <p class="font-display text-3xl font-semibold">KES 1,530,612</p>
            </div>
            <div class="meridian-line pl-5 text-sm text-muted-foreground">
              <p>Compliance checks cleared</p>
              <p>Converted by our licensed partner</p>
              <p>Payout sent to supplier's bank</p>
            </div>
            <div class="rounded-xl border border-primary/40 bg-primary/10 p-4">
              <p class="text-xs text-muted-foreground">Shenzhen, China — supplier receives</p>
              <p class="font-display text-3xl font-semibold text-primary">¥ 82,400</p>
              <p class="mt-1 text-xs text-muted-foreground">
                The full KES 1,500,000. Fees of KES 30,612 (2%) paid on top. Your bank would take 8
                to 10%.
              </p>
            </div>
          </div>
          <p class="mt-4 text-xs text-muted-foreground">
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
    <section id="problem" class="border-t border-border/70 px-5 py-20">
      <div class="mx-auto max-w-6xl">
        <h2 class="max-w-2xl font-display text-3xl font-bold sm:text-4xl">
          If you import or export, you know this already
        </h2>
        <p class="mt-4 max-w-2xl text-muted-foreground">
          We heard these from Kenyan importers of electronics, hardware and cars, and from exporters
          of fresh produce. Meridian is built for them.
        </p>
        <div class="mt-10 grid gap-5 sm:grid-cols-2">
          <For each={PAINS}>
            {(p) => (
              <div class="panel p-6">
                <Dynamic component={p.icon} class="h-6 w-6 text-primary" />
                <h3 class="mt-4 text-lg font-semibold">{p.title}</h3>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            )}
          </For>
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
    <section class="border-t border-border/70 px-5 py-20">
      <div class="mx-auto max-w-6xl">
        <div class="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 class="font-display text-3xl font-bold sm:text-4xl">
              One account. Pay out. Get paid.
            </h2>
            <p class="mt-4 text-muted-foreground">
              Meridian sits between your bank or mobile money and the rest of the world. You send.
              We handle conversion, compliance and delivery. Your supplier gets local currency.
            </p>
            <p class="mt-4 text-muted-foreground">
              Meridian does not hold your money. Licensed, regulated partners move it. We build the
              software and check every transaction.
            </p>
          </div>
          <div class="grid gap-5 sm:grid-cols-2">
            <For each={BENEFITS}>
              {(b) => (
                <div class="panel p-6">
                  <Dynamic component={b.icon} class="h-5 w-5 text-accent" />
                  <h3 class="mt-3 font-semibold">{b.title}</h3>
                  <p class="mt-2 text-sm text-muted-foreground">{b.body}</p>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- demos --------------------------------- */

const DEMOS = [
  {
    to: "/demo/checkout",
    icon: Receipt,
    title: "Checkout on your site",
    body: "What your customer sees when they pay you. Bank, mobile money or card. Fees shown first.",
  },
  {
    to: "/demo/send",
    icon: Globe2,
    title: "Pay a supplier abroad",
    body: "Send to another country. Watch the fees, the conversion and the payout, step by step.",
  },
  {
    to: "/demo/request",
    icon: Link2,
    title: "Payment link",
    body: "Create a link, share it, then open it as the payer and settle it.",
  },
];

function Demos() {
  return (
    <section id="demos" class="border-t border-border/70 px-5 py-20">
      <div class="mx-auto max-w-6xl">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 class="font-display text-3xl font-bold sm:text-4xl">Try it</h2>
            <p class="mt-3 max-w-2xl text-muted-foreground">
              Three working demos. They behave like the real product. No money moves. No account
              needed.
            </p>
          </div>
          <span class="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            Demo environment
          </span>
        </div>
        <div class="mt-10 grid gap-5 md:grid-cols-3">
          <For each={DEMOS}>
            {(d) => (
              <A href={d.to} class="panel group p-6 transition-colors hover:bg-surface">
                <Dynamic component={d.icon} class="h-6 w-6 text-primary" />
                <h3 class="mt-4 text-lg font-semibold">{d.title}</h3>
                <p class="mt-2 text-sm text-muted-foreground">{d.body}</p>
                <span class="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  Open demo{" "}
                  <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </A>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- pricing -------------------------------- */

function Pricing() {
  const [amount, setAmount] = createSignal(2500000);
  const [from, setFrom] = createSignal<Currency>("NGN");
  const [to, setTo] = createSignal<Currency>("KES");
  const quote = () => quoteCrossBorder(amount() || 0, from(), to(), "bank");

  return (
    <section id="pricing" class="border-t border-border/70 px-5 py-20">
      <div class="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-start">
        <div>
          <h2 class="font-display text-3xl font-bold sm:text-4xl">
            Partner fee, plus 1%. That is all.
          </h2>
          <p class="mt-4 text-muted-foreground">
            Our licensed partner charges a fee to collect and pay out. We show you that fee, add a
            flat 1%, and that is the whole price. No monthly fee. No markup on the exchange rate.
          </p>
          <ul class="mt-6 space-y-3 text-sm">
            <For
              each={[
                "Bank transfer: about 1% partner fee",
                "Mobile money: about 2% partner fee",
                "Card: about 2.5% partner fee",
                "Exchange rate: set by our partner, shown before you confirm",
                "Meridian: flat 1%",
              ]}
            >
              {(line) => (
                <li class="flex gap-3">
                  <ShieldCheck class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span class="text-muted-foreground">{line}</span>
                </li>
              )}
            </For>
          </ul>
          <p class="mt-6 text-xs text-muted-foreground">
            Partner fees are estimates until launch. They vary by country and method.
          </p>
        </div>

        <div class="panel p-6">
          <p class="text-sm font-semibold">What will it cost?</p>
          <div class="mt-4 grid gap-4 sm:grid-cols-3">
            <label class="block text-xs text-muted-foreground sm:col-span-1">
              You send
              <select
                value={from()}
                onChange={(e) => setFrom(e.currentTarget.value as Currency)}
                class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                <For each={CURRENCIES}>
                  {(c) => (
                    <option value={c.code} selected={c.code === from()}>
                      {c.code}
                    </option>
                  )}
                </For>
              </select>
            </label>
            <input
              type="number"
              min={0}
              aria-label="Amount"
              placeholder="Amount"
              value={amount()}
              onInput={(e) => setAmount(Number(e.currentTarget.value))}
              class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 self-end sm:col-span-2"
            />
            <label class="block text-xs text-muted-foreground sm:col-span-3">
              They receive in
              <select
                value={to()}
                onChange={(e) => setTo(e.currentTarget.value as Currency)}
                class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                <For each={CURRENCIES}>
                  {(c) => (
                    <option value={c.code} selected={c.code === to()}>
                      {c.code} — {c.name}
                    </option>
                  )}
                </For>
              </select>
            </label>
          </div>
          <div class="mt-5">
            <FeeBreakdown quote={quote()} currencyCode={from()} receiveCurrency={to()} />
          </div>
          <p class="mt-4 text-sm text-muted-foreground">
            Compared with a typical bank route, you keep about{" "}
            <span class="font-semibold text-success">
              {formatMoney(Math.max(quote().saving, 0), from())}
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
    <section id="how" class="border-t border-border/70 px-5 py-20">
      <div class="mx-auto max-w-6xl">
        <h2 class="font-display text-3xl font-bold sm:text-4xl">How it works</h2>
        <div class="mt-10 grid gap-5 md:grid-cols-3">
          <For each={STEPS}>
            {(s) => (
              <div class="panel p-6">
                <span class="font-mono text-sm text-accent">{s.n}</span>
                <h3 class="mt-3 text-lg font-semibold">{s.title}</h3>
                <p class="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- waitlist -------------------------------- */

function formValue(form: FormData, key: string) {
  return String(form.get(key) ?? "");
}

function Waitlist() {
  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal(false);

  async function onSubmit(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const result = await joinWaitlist({
        business_name: formValue(form, "business_name"),
        contact_name: formValue(form, "contact_name"),
        email: formValue(form, "email"),
        country: formValue(form, "country"),
        monthly_volume: formValue(form, "monthly_volume"),
        pain_point: formValue(form, "pain_point"),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDone(true);
      toast.success("You're on the list — check your inbox.");
    } catch {
      toast.error("We couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="waitlist" class="border-t border-border/70 px-5 py-20">
      <div class="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h2 class="font-display text-3xl font-bold sm:text-4xl">
            Tell us where you send money. We build that route first.
          </h2>
          <p class="mt-4 text-muted-foreground">
            Meridian is in development. The waitlist decides which countries and payment methods we
            launch with.
          </p>
          <ul class="mt-6 space-y-3 text-sm text-muted-foreground">
            <For
              each={[
                "Founding pricing locked for 12 months",
                "Early access on your route before public launch",
                "A direct line to the team",
                "One email when we go live. Nothing else.",
              ]}
            >
              {(b) => (
                <li class="flex gap-3">
                  <Sparkles class="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  {b}
                </li>
              )}
            </For>
          </ul>
        </div>

        <div class="panel p-6">
          <Show
            when={!done()}
            fallback={
              <div class="py-10 text-center">
                <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                  <ShieldCheck class="h-6 w-6 text-success" />
                </div>
                <h3 class="mt-4 text-xl font-semibold">You're on the list</h3>
                <p class="mt-2 text-sm text-muted-foreground">
                  A confirmation is on its way. We'll notify you the moment Meridian is ready.
                </p>
              </div>
            }
          >
            <form onSubmit={onSubmit} class="space-y-4">
              <h3 class="text-lg font-semibold">Join the waitlist</h3>
              <div class="grid gap-4 sm:grid-cols-2">
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
              <textarea
                id="pain_point"
                name="pain_point"
                rows={3}
                aria-label="Who do you pay, or who pays you, across borders?"
                placeholder="Who do you pay, or who pays you, across borders? e.g. We pay a hardware factory in China every month. Equity takes 5 days."
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70"
              />
              <button
                type="submit"
                disabled={busy()}
                class="w-full rounded-full bg-flow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy() ? "Adding you…" : "Get early access"}
              </button>
              <p class="text-xs text-muted-foreground">
                We only email you about Meridian. No marketing lists.
              </p>
            </form>
          </Show>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- contact -------------------------------- */

function Contact() {
  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal(false);

  async function onSubmit(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const result = await sendContactMessage({
        name: formValue(form, "name"),
        email: formValue(form, "email"),
        company: formValue(form, "company"),
        subject: formValue(form, "subject"),
        message: formValue(form, "message"),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDone(true);
      toast.success("Message sent — confirmation emailed.");
    } catch {
      toast.error("Message not sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="contact" class="border-t border-border/70 px-5 py-20">
      <div class="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h2 class="font-display text-3xl font-bold sm:text-4xl">Talk to us</h2>
          <p class="mt-4 text-muted-foreground">
            Ask about a country we do not list yet, our partners, or compliance. A person replies.
          </p>
          <p class="mt-4 text-sm text-muted-foreground">
            Meridian is built by Appify Softwares Limited,{" "}
            <a
              href="https://appify.co.ke"
              target="_blank"
              rel="noreferrer"
              class="text-primary hover:underline"
            >
              appify.co.ke
            </a>
            .
          </p>
        </div>
        <div class="panel p-6">
          <Show
            when={!done()}
            fallback={
              <div class="py-10 text-center">
                <h3 class="text-xl font-semibold">Message received</h3>
                <p class="mt-2 text-sm text-muted-foreground">
                  We've emailed you a confirmation and will be in touch soon.
                </p>
              </div>
            }
          >
            <form onSubmit={onSubmit} class="space-y-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <Field name="name" label="Your name" required />
                <Field name="email" label="Email" type="email" required />
                <Field name="company" label="Company" />
                <Field name="subject" label="Subject" placeholder="Partnership" />
              </div>
              <textarea
                id="message"
                name="message"
                rows={4}
                required
                aria-label="Message"
                placeholder="Message"
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70"
              />
              <button
                type="submit"
                disabled={busy()}
                class="w-full rounded-full border border-primary/60 bg-primary/10 px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
              >
                {busy() ? "Sending…" : "Send message"}
              </button>
            </form>
          </Show>
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
    <section id="faq" class="border-t border-border/70 px-5 py-20">
      <div class="mx-auto max-w-3xl">
        <h2 class="font-display text-3xl font-bold sm:text-4xl">Frequently asked questions</h2>
        <Accordion class="mt-8">
          <For each={FAQS}>
            {(f) => (
              <AccordionItem value={f.q}>
                <AccordionTrigger class="text-left text-base">{f.q}</AccordionTrigger>
                <AccordionContent class="text-sm leading-relaxed text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            )}
          </For>
        </Accordion>
      </div>
    </section>
  );
}

/* -------------------------------- form bits ------------------------------- */

function Field(props: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      id={props.name}
      name={props.name}
      type={props.type ?? "text"}
      required={props.required}
      aria-label={props.label}
      placeholder={props.placeholder ? `${props.label}, e.g. ${props.placeholder}` : props.label}
      class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70"
    />
  );
}

function SelectField(props: { name: string; label: string; options: string[] }) {
  return (
    <div>
      <label class="text-xs font-medium text-muted-foreground" for={props.name}>
        {props.label}
      </label>
      <select
        id={props.name}
        name={props.name}
        class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
      >
        <option value="">Select…</option>
        <For each={props.options}>{(o) => <option value={o}>{o}</option>}</For>
      </select>
    </div>
  );
}
